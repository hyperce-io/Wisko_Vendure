import { Injectable } from "@nestjs/common";
import {
  Customer,
  CustomerService,
  HistoryService,
  ID,
  Logger,
  Order,
  RequestContext,
  TransactionalConnection,
  UserInputError,
  idsAreEqual,
  isGraphQlErrorResult,
  normalizeEmailAddress,
} from "@vendure/core";
import { ROUTING_KEYS } from "../rabbitmq/rabbitmq.constants";
import { RabbitMQPublisher } from "../rabbitmq/rabbitmq.publisher";
import { PrivacyErasureInput } from "../types";
import { TenantService } from "./tenant.service";

const ERASED_NOTE = "Customer deleted; orders kept for accounting with personal data removed";

/**
 * Erases a data subject (privacy.erasure_requested) and answers privacy.erasure_completed.
 *
 * Each matching customer (by email, and by `vendureCustomerId`) has its addresses blanked, its
 * name, email, phone and date of birth replaced, its history removed, and is then soft-deleted
 * (with its user). Its orders keep their lines and amounts; their address snapshots are cleared.
 * The request id is stored on the erased customers, so a redelivered request gets the same reply.
 */
@Injectable()
export class PrivacyErasureService {
  constructor(
    private connection: TransactionalConnection,
    private customerService: CustomerService,
    private historyService: HistoryService,
    private tenantService: TenantService,
    private publisher: RabbitMQPublisher,
  ) {}

  async eraseSubject(ctx: RequestContext, input: PrivacyErasureInput): Promise<void> {
    const erasedCount = await this.connection.withTransaction(ctx, async (txCtx) => {
      const alreadyErased = await this.connection.getRepository(txCtx, Customer).count({
        where: { customFields: { erasureRequestId: input.requestId } },
      });
      if (alreadyErased) {
        Logger.info(
          `Erasure ${input.requestId} already done (${alreadyErased} customer(s)), reply sent again`,
          "PrivacyErasure",
        );
        return alreadyErased;
      }
      const customers = await this.findSubjectCustomers(txCtx, input);
      for (const customer of customers) {
        await this.eraseCustomer(txCtx, customer.id, input.requestId);
      }
      return customers.length;
    });

    await this.publisher.publish(ROUTING_KEYS.PRIVACY_ERASURE_COMPLETED, {
      requestId: input.requestId,
      system: "vendure",
      status: erasedCount ? "erased" : "not_found",
      completedAt: new Date().toISOString(),
      note: erasedCount ? ERASED_NOTE : null,
    });
  }

  private async findSubjectCustomers(
    ctx: RequestContext,
    input: PrivacyErasureInput,
  ): Promise<Customer[]> {
    const byEmail = await this.customerService.findAll(
      ctx,
      { filter: { emailAddress: { eq: normalizeEmailAddress(input.email) } } },
      ["channels"],
    );
    const byId = input.vendureCustomerId
      ? await this.customerService.findOne(ctx, input.vendureCustomerId, ["channels"])
      : undefined;
    const customers = [
      ...byEmail.items,
      ...(byId && !byEmail.items.some((customer) => idsAreEqual(customer.id, byId.id)) ? [byId] : []),
    ];
    if (!input.superOrganizationCode) {
      return customers;
    }

    const company = await this.tenantService.findCompanyByCode(ctx, input.superOrganizationCode);
    if (!company) {
      return [];
    }
    const companyChannelIds = new Set(
      (await this.tenantService.getChannelsForCompany(company.id)).map((channel) =>
        String(channel.id),
      ),
    );
    return customers.filter((customer) =>
      customer.channels.some((channel) => companyChannelIds.has(String(channel.id))),
    );
  }

  private async eraseCustomer(ctx: RequestContext, customerId: ID, requestId: string) {
    const addresses = await this.customerService.findAddressesByCustomerId(ctx, customerId);
    for (const address of addresses) {
      await this.customerService.updateAddress(ctx, {
        id: address.id,
        fullName: "",
        company: "",
        streetLine1: "",
        streetLine2: "",
        city: "",
        province: "",
        postalCode: "",
        phoneNumber: "",
      });
    }

    const result = await this.customerService.update(ctx, {
      id: customerId,
      title: "",
      firstName: "Erased",
      lastName: "Customer",
      emailAddress: `erased-${customerId}@erased.invalid`,
      phoneNumber: "",
      customFields: { dateOfBirth: null, erasureRequestId: requestId },
    });
    if (isGraphQlErrorResult(result)) {
      throw new UserInputError(`Erasure ${requestId}, customer ${customerId}: ${result.message}`);
    }

    // OrderService.setShippingAddress re-applies prices, so placed orders are cleared like its unset methods do.
    const clearedOrders = await this.connection
      .getRepository(ctx, Order)
      .update({ customerId }, { shippingAddress: {}, billingAddress: {} });

    const history = await this.historyService.getHistoryForCustomer(ctx, customerId, false);
    for (const entry of history.items) {
      await this.historyService.deleteCustomerHistoryEntry(ctx, entry.id);
    }

    await this.customerService.softDelete(ctx, customerId);
    Logger.info(
      `Erasure ${requestId}: customer ${customerId} erased, ${clearedOrders.affected ?? 0} order(s) anonymised`,
      "PrivacyErasure",
    );
  }
}
