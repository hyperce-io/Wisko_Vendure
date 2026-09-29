import { Injectable } from "@nestjs/common";
import {
    Channel,
    LanguageCode,
    Logger,
    RequestContext,
    ShippingMethod,
    ShippingMethodService,
    TransactionalConnection,
    UserInputError,
    defaultShippingCalculator,
    defaultShippingEligibilityChecker,
    idsAreEqual,
    manualFulfillmentHandler,
} from "@vendure/core";
import { IsNull } from "typeorm";
import { SyncShippingMethodInput } from "../types";

/**
 * Mirrors ERP Shipping Rules (shipping_method.created / updated / deleted) into Vendure.
 *
 * Unlike a payment method, an ERP Shipping Rule belongs to exactly one store company, so each
 * `code` is one Vendure ShippingMethod assigned to that one store's channel. ERP only publishes
 * Fixed-rate rules, which is all default-shipping-calculator can price.
 *
 * ShippingMethod has no enabled flag, so a disabled rule is removed from the channel instead.
 * The method itself is never soft-deleted: a soft-deleted method cannot be brought back, and
 * re-enabling the rule in ERP sends shipping_method.updated with the same code.
 */
@Injectable()
export class ShippingMethodSyncService {
  constructor(
    private connection: TransactionalConnection,
    private shippingMethodService: ShippingMethodService,
  ) {}

  async syncShippingMethod(
    ctx: RequestContext,
    input: SyncShippingMethodInput,
  ): Promise<void> {
    if (!input.enabled) {
      return this.removeShippingMethodFromChannel(ctx, input);
    }

    return this.connection.withTransaction(ctx, async (txCtx) => {
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
      if (input.currency && input.currency !== channel.defaultCurrencyCode) {
        throw new UserInputError(
          `Shipping method ${input.code} is priced in ${input.currency} but channel ${channel.code} uses ${channel.defaultCurrencyCode}`,
        );
      }

      const methodFields = {
        fulfillmentHandler: manualFulfillmentHandler.code,
        checker: {
          code: defaultShippingEligibilityChecker.code,
          arguments: [{ name: "orderMinimum", value: "0" }],
        },
        calculator: {
          code: defaultShippingCalculator.code,
          arguments: [
            { name: "rate", value: String(input.shippingAmount) },
            { name: "includesTax", value: "auto" },
            { name: "taxRate", value: "0" },
          ],
        },
        translations: [
          {
            languageCode: LanguageCode.en,
            name: input.name,
            description: input.description ?? "",
          },
        ],
      };

      const existing = await this.findByCode(txCtx, input.code);
      const shippingMethod = existing
        ? await this.shippingMethodService.update(txCtx, {
            id: existing.id,
            ...methodFields,
          })
        : await this.shippingMethodService.create(txCtx, {
            code: input.code,
            ...methodFields,
          });

      const isAssigned = (existing?.channels ?? []).some((assigned) =>
        idsAreEqual(assigned.id, channel.id),
      );
      if (!isAssigned) {
        await this.shippingMethodService.assignShippingMethodsToChannel(txCtx, {
          shippingMethodIds: [shippingMethod.id],
          channelId: channel.id,
        });
      }

      Logger.info(
        `${existing ? "Updated" : "Created"} shipping method ${input.code} (${input.name}, ${input.shippingAmount}) for channel ${channel.code}`,
        "ShippingMethodSync",
      );
    });
  }

  async removeShippingMethodFromChannel(
    ctx: RequestContext,
    input: Pick<SyncShippingMethodInput, "erpChannelId" | "code">,
  ): Promise<void> {
    return this.connection.withTransaction(ctx, async (txCtx) => {
      const channel = await this.findChannelByErpChannelId(
        txCtx,
        input.erpChannelId,
      );
      const existing = await this.findByCode(txCtx, input.code);
      if (
        !channel ||
        !existing?.channels.some((assigned) =>
          idsAreEqual(assigned.id, channel.id),
        )
      ) {
        Logger.info(
          `Shipping method ${input.code} is not assigned to channel ${input.erpChannelId}, nothing to remove`,
          "ShippingMethodSync",
        );
        return;
      }

      await this.shippingMethodService.removeShippingMethodsFromChannel(txCtx, {
        shippingMethodIds: [existing.id],
        channelId: channel.id,
      });
      Logger.info(
        `Removed shipping method ${input.code} from channel ${channel.code}`,
        "ShippingMethodSync",
      );
    });
  }

  private findByCode(
    ctx: RequestContext,
    code: string,
  ): Promise<ShippingMethod | null> {
    return this.connection.getRepository(ctx, ShippingMethod).findOne({
      where: { code, deletedAt: IsNull() },
      relations: { channels: true },
    });
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
