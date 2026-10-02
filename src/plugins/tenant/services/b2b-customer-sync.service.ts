import { Injectable } from "@nestjs/common";
import {
  Channel,
  ChannelService,
  Customer,
  CustomerGroupService,
  CustomerService,
  Logger,
  RelationPaths,
  RequestContext,
  TransactionalConnection,
  UserInputError,
  idsAreEqual,
  isGraphQlErrorResult,
} from "@vendure/core";
import { IsNull } from "typeorm";
import { RabbitMQPublisher } from "../rabbitmq/rabbitmq.publisher";
import { ROUTING_KEYS } from "../rabbitmq/rabbitmq.constants";
import { SyncB2bCustomerInput } from "../types";

/**
 * Creates or updates the B2B customer of a deal won in ERP (b2b_customer.upserted) in its store's
 * channel, and puts it in its customer group.
 *
 * The customer is matched by its ERP Customer ID (customFields.erpCustomerId), else by email, which
 * CustomerService keeps unique across channels; either way the ERP id is stored on it. A new one is
 * created without a password: CustomerService.create then publishes an AccountRegistrationEvent, so
 * the customer verifies the email address and sets a password themselves. Customer groups are
 * global in Vendure (not channel-aware), but a group's member list is read per channel
 * (CustomerGroupService.getGroupCustomers), so each store only sees its own customers in it.
 *
 * After the transaction commits, the Vendure customer id is sent back on the ERP's id write-back
 * reply (vendure.erp-sync.reply), so the ERP Customer is linked without waiting for an order.
 */
@Injectable()
export class B2bCustomerSyncService {
  constructor(
    private connection: TransactionalConnection,
    private customerService: CustomerService,
    private customerGroupService: CustomerGroupService,
    private channelService: ChannelService,
    private publisher: RabbitMQPublisher,
  ) {}

  async syncB2bCustomer(
    ctx: RequestContext,
    input: SyncB2bCustomerInput,
  ): Promise<void> {
    const customer = await this.connection.withTransaction(ctx, async (txCtx) => {
      const channel = await this.findChannelByErpChannelId(
        txCtx,
        input.erpChannelId,
      );
      if (!channel) {
        // Thrown, not swallowed: the consumer nacks and the message lands on the DLQ.
        throw new UserInputError(
          `Channel with erpChannelId "${input.erpChannelId}" not found`,
        );
      }

      const existing = await this.findExisting(txCtx, input);
      const details = {
        firstName: input.firstName,
        lastName: input.lastName,
        phoneNumber: input.phoneNumber ?? undefined,
        customFields: { erpCustomerId: input.erpCustomerId },
      };
      const result = existing
        ? await this.customerService.update(txCtx, {
            id: existing.id,
            emailAddress: input.emailAddress,
            ...details,
          })
        : await this.customerService.create(txCtx, {
            emailAddress: input.emailAddress,
            ...details,
          });
      if (isGraphQlErrorResult(result)) {
        throw new UserInputError(
          `B2B customer ${input.emailAddress}: ${result.message}`,
        );
      }

      if (
        !(existing?.channels ?? []).some((assigned) =>
          idsAreEqual(assigned.id, channel.id),
        )
      ) {
        await this.channelService.assignToChannels(
          txCtx,
          Customer,
          result.id,
          [channel.id],
        );
      }

      const group = (
        await this.customerGroupService.findAll(txCtx, {
          filter: { name: { eq: input.customerGroup } },
          take: 1,
        })
      ).items[0];
      if (!group) {
        await this.customerGroupService.create(txCtx, {
          name: input.customerGroup,
          customerIds: [result.id],
        });
      } else if (
        !(existing?.groups ?? []).some((member) =>
          idsAreEqual(member.id, group.id),
        )
      ) {
        await this.customerGroupService.addCustomersToGroup(txCtx, {
          customerGroupId: group.id,
          customerIds: [result.id],
        });
      }

      Logger.info(
        `${existing ? "Updated" : "Created"} B2B customer ${input.emailAddress} (erp: ${input.erpCustomerId}) ` +
          `in channel ${channel.code}, group ${input.customerGroup}`,
        "B2bCustomerSync",
      );
      return result;
    });

    await this.publisher.publish(ROUTING_KEYS.ERP_SYNC_REPLY, {
      success: true,
      customer: { erpCustomerId: input.erpCustomerId, id: String(customer.id) },
    });
  }

  /** The customer already linked to this ERP customer, else the one with the same email. */
  private async findExisting(
    ctx: RequestContext,
    input: SyncB2bCustomerInput,
  ): Promise<Customer | undefined> {
    const relations: RelationPaths<Customer> = ["channels", "groups"];
    // By repository, like findChannelByErpChannelId: CustomerService.findAll's filter type has no
    // custom fields.
    const linked = await this.connection.getRepository(ctx, Customer).findOne({
      where: {
        customFields: { erpCustomerId: input.erpCustomerId },
        deletedAt: IsNull(),
      },
      relations,
    });
    if (linked) {
      return linked;
    }
    const sameEmail = await this.customerService.findAll(
      ctx,
      { filter: { emailAddress: { eq: input.emailAddress } }, take: 1 },
      relations,
    );
    return sameEmail.items[0];
  }

  private findChannelByErpChannelId(
    ctx: RequestContext,
    erpChannelId: string,
  ): Promise<Channel | null> {
    return this.connection
      .getRepository(ctx, Channel)
      .findOne({ where: { customFields: { erpChannelId } } });
  }
}
