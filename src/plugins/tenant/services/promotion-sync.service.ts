import { Injectable } from "@nestjs/common";
import {
  ConfigurableOperationInput,
  UpdatePromotionInput,
} from "@vendure/common/lib/generated-types";
import {
  Channel,
  ChannelService,
  LanguageCode,
  Logger,
  Promotion,
  PromotionService,
  RequestContext,
  TransactionalConnection,
  UserInputError,
  idsAreEqual,
  isGraphQlErrorResult,
  minimumOrderAmount,
  orderFixedDiscount,
  orderPercentageDiscount,
} from "@vendure/core";
import { In, IsNull, Not } from "typeorm";
import {
  erpItemsCondition,
  erpItemsDiscountAction,
} from "../promotion/erp-items-promotion";
import { SyncPromotionInput } from "../types";

/**
 * Mirrors ERP Pricing Rules / Coupon Codes (promotion.upserted / disabled / reconcile) into
 * Vendure Promotions. ERP is the source of truth; Vendure applies the promotion at checkout and
 * enforces its usage limits there.
 *
 * Each promotion is found by `erpPromotionId`, an exact key ERP sends, never one derived from a
 * name. A message older than the stored `erpModifiedAt` is skipped, so a redelivered or reordered
 * message never overwrites a newer state. A removed rule is disabled, never deleted: placed orders
 * keep a link to their promotions, and Vendure counts usage from those links.
 */
@Injectable()
export class PromotionSyncService {
  constructor(
    private connection: TransactionalConnection,
    private promotionService: PromotionService,
    private channelService: ChannelService,
  ) {}

  async syncPromotion(
    ctx: RequestContext,
    input: SyncPromotionInput,
  ): Promise<void> {
    return this.connection.withTransaction(ctx, async (txCtx) => {
      const existing = await this.findByErpPromotionId(
        txCtx,
        input.erpPromotionId,
      );
      if (this.isStale(existing, input.modified)) {
        Logger.info(
          `Promotion ${input.erpPromotionId}: message from ${input.modified.toISOString()} is older than the stored state, skipped`,
          "PromotionSync",
        );
        return;
      }

      const channels = await this.findChannels(txCtx, input);

      // null is "no limit". Vendure's generated input types leave null out (InputMaybe<T> = T),
      // but PromotionService saves through patchEntity, which sets a field to null when given null
      // (service/helpers/utils/patch-entity.ts); that is how a limit removed in ERP is removed here.
      const limits = {
        usageLimit: input.usageLimit,
        perCustomerUsageLimit: input.perCustomerUsageLimit,
      } as Pick<UpdatePromotionInput, "usageLimit" | "perCustomerUsageLimit">;
      const promotionFields = {
        enabled: input.enabled,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        couponCode: input.couponCode,
        ...limits,
        conditions: this.conditionsFor(input),
        actions: this.actionsFor(input),
        translations: [{ languageCode: LanguageCode.en, name: input.name }],
        customFields: {
          erpPromotionId: input.erpPromotionId,
          erpModifiedAt: input.modified,
        },
      };
      const result = existing
        ? await this.promotionService.updatePromotion(txCtx, {
            id: existing.id,
            ...promotionFields,
          })
        : await this.promotionService.createPromotion(txCtx, promotionFields);
      if (isGraphQlErrorResult(result)) {
        throw new UserInputError(
          `Promotion ${input.erpPromotionId}: ${result.message}`,
        );
      }

      await this.syncChannels(txCtx, result.id, existing?.channels ?? [], channels);

      Logger.info(
        `${existing ? "Updated" : "Created"} promotion ${input.erpPromotionId} (${input.name}) in ${channels.length} channel(s)`,
        "PromotionSync",
      );
    });
  }

  async disablePromotion(
    ctx: RequestContext,
    erpPromotionId: string,
    modified: Date,
  ): Promise<void> {
    return this.connection.withTransaction(ctx, async (txCtx) => {
      const existing = await this.findByErpPromotionId(txCtx, erpPromotionId);
      if (!existing) {
        Logger.info(
          `Promotion ${erpPromotionId} is not in Vendure, nothing to disable`,
          "PromotionSync",
        );
        return;
      }
      if (this.isStale(existing, modified)) {
        Logger.info(
          `Promotion ${erpPromotionId}: disable from ${modified.toISOString()} is older than the stored state, skipped`,
          "PromotionSync",
        );
        return;
      }
      await this.disable(txCtx, existing, modified);
    });
  }

  /**
   * Disables every ERP-managed promotion whose id is not in `erpPromotionIds`, the full list ERP
   * currently publishes. Heals a promotion.disabled message that never arrived.
   */
  async reconcilePromotions(
    ctx: RequestContext,
    erpPromotionIds: string[],
  ): Promise<void> {
    return this.connection.withTransaction(ctx, async (txCtx) => {
      const orphans = await this.connection
        .getRepository(txCtx, Promotion)
        .find({
          where: {
            enabled: true,
            deletedAt: IsNull(),
            customFields: {
              erpPromotionId: erpPromotionIds.length
                ? Not(In(erpPromotionIds))
                : Not(IsNull()),
            },
          },
        });
      for (const promotion of orphans) {
        await this.disable(txCtx, promotion, new Date());
      }
      Logger.info(
        `Reconciled promotions: ${erpPromotionIds.length} live in ERP, ${orphans.length} disabled`,
        "PromotionSync",
      );
    });
  }

  private conditionsFor(input: SyncPromotionInput): ConfigurableOperationInput[] {
    if (input.applyOn === "items") {
      return [
        {
          code: erpItemsCondition.code,
          arguments: [
            { name: "skus", value: JSON.stringify(input.skus) },
            { name: "itemGroups", value: JSON.stringify(input.itemGroups) },
            { name: "brands", value: JSON.stringify(input.brands) },
          ],
        },
      ];
    }
    // Always present, even at 0: Vendure refuses a promotion with neither a condition nor a
    // coupon code. ERPNext compares a transaction rule's minimum to the net (pre-tax) total.
    return [
      {
        code: minimumOrderAmount.code,
        arguments: [
          { name: "amount", value: String(input.minOrderAmount) },
          { name: "taxInclusive", value: "false" },
        ],
      },
    ];
  }

  private actionsFor(input: SyncPromotionInput): ConfigurableOperationInput[] {
    if (input.applyOn === "items") {
      return [
        {
          code: erpItemsDiscountAction.code,
          arguments: [
            { name: "percentage", value: String(input.discountPercentage) },
            { name: "amount", value: String(input.discountAmount) },
          ],
        },
      ];
    }
    return input.discountPercentage
      ? [
          {
            code: orderPercentageDiscount.code,
            arguments: [
              { name: "discount", value: String(input.discountPercentage) },
            ],
          },
        ]
      : [
          {
            code: orderFixedDiscount.code,
            arguments: [{ name: "discount", value: String(input.discountAmount) }],
          },
        ];
  }

  /**
   * The store channels the promotion runs in. A missing channel or, for a promotion with an
   * amount, a channel in another currency is thrown, not skipped: the consumer nacks and the
   * message lands on the DLQ instead of a promotion silently running in fewer stores, or charging
   * an amount meant for another currency.
   */
  private async findChannels(
    ctx: RequestContext,
    input: SyncPromotionInput,
  ): Promise<Channel[]> {
    const channels = input.erpChannelIds.length
      ? await this.connection.getRepository(ctx, Channel).find({
          where: { customFields: { erpChannelId: In(input.erpChannelIds) } },
        })
      : [];
    if (channels.length < input.erpChannelIds.length) {
      throw new UserInputError(
        `Promotion ${input.erpPromotionId}: ${input.erpChannelIds.length - channels.length} store channel(s) not in Vendure yet`,
      );
    }
    const hasAmount = input.discountAmount > 0 || input.minOrderAmount > 0;
    const otherCurrency = channels.find(
      (channel) => channel.defaultCurrencyCode !== input.currency,
    );
    if (hasAmount && otherCurrency) {
      throw new UserInputError(
        `Promotion ${input.erpPromotionId} has amounts in ${input.currency} but channel ${otherCurrency.code} uses ${otherCurrency.defaultCurrencyCode}`,
      );
    }
    return channels;
  }

  /** Assigns the promotion to `channels` and removes it from store channels no longer listed. */
  private async syncChannels(
    ctx: RequestContext,
    promotionId: Promotion["id"],
    currentChannels: Channel[],
    channels: Channel[],
  ): Promise<void> {
    const defaultChannel = await this.channelService.getDefaultChannel(ctx);
    for (const channel of channels) {
      if (!currentChannels.some((current) => idsAreEqual(current.id, channel.id))) {
        await this.promotionService.assignPromotionsToChannel(ctx, {
          promotionIds: [promotionId],
          channelId: channel.id,
        });
      }
    }
    for (const current of currentChannels) {
      const isListed = channels.some((channel) => idsAreEqual(channel.id, current.id));
      if (!isListed && !idsAreEqual(current.id, defaultChannel.id)) {
        await this.promotionService.removePromotionsFromChannel(ctx, {
          promotionIds: [promotionId],
          channelId: current.id,
        });
      }
    }
  }

  private async disable(
    ctx: RequestContext,
    promotion: Promotion,
    modified: Date,
  ): Promise<void> {
    const result = await this.promotionService.updatePromotion(ctx, {
      id: promotion.id,
      enabled: false,
      customFields: { erpModifiedAt: modified },
    });
    if (isGraphQlErrorResult(result)) {
      throw new UserInputError(
        `Promotion ${promotion.customFields.erpPromotionId}: ${result.message}`,
      );
    }
    Logger.info(
      `Disabled promotion ${promotion.customFields.erpPromotionId}`,
      "PromotionSync",
    );
  }

  private isStale(existing: Promotion | null, modified: Date): boolean {
    const storedModified = existing?.customFields.erpModifiedAt;
    return !!storedModified && storedModified.getTime() > modified.getTime();
  }

  private findByErpPromotionId(
    ctx: RequestContext,
    erpPromotionId: string,
  ): Promise<Promotion | null> {
    return this.connection.getRepository(ctx, Promotion).findOne({
      where: { customFields: { erpPromotionId }, deletedAt: IsNull() },
      relations: { channels: true },
    });
  }
}
