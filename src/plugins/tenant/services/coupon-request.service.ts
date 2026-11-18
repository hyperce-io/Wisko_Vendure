import { Injectable } from "@nestjs/common";
import { DeletionResult } from "@vendure/common/lib/generated-types";
import { randomInt } from "crypto";
import { IsNull, LessThan, Not } from "typeorm";
import {
  Channel,
  CustomerService,
  LanguageCode,
  Logger,
  Promotion,
  PromotionService,
  RequestContext,
  ScheduledTask,
  TransactionalConnection,
  UserInputError,
  idsAreEqual,
  isGraphQlErrorResult,
  orderPercentageDiscount,
} from "@vendure/core";
import { customerCondition } from "../promotion/customer-promotion";
import { ROUTING_KEYS } from "../rabbitmq/rabbitmq.constants";
import { RabbitMQPublisher } from "../rabbitmq/rabbitmq.publisher";
import { CouponRequestInput } from "../types";

const COUPON_PREFIXES: Record<string, string> = { birthday: "BDAY" };
const COUPON_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const COUPON_RANDOM_LENGTH = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRED_PAGE_SIZE = 100;

type CouponOutcome = { promotion: Promotion } | { failureReason: string };

/**
 * Creates the personal coupon Mautic asks for (coupon.requested), e.g. a birthday coupon: a
 * percentage discount on the order, in one store channel, usable once and only by that customer.
 *
 * One coupon per customer per purpose per year, keyed by `couponRequestKey`: a repeated request
 * (a redelivery, or Mautic asking again) gets the same coupon back. A customer or channel that
 * does not exist is answered with coupon.failed; a malformed message is thrown by the handler
 * and lands on the DLQ.
 */
@Injectable()
export class CouponRequestService {
  constructor(
    private connection: TransactionalConnection,
    private promotionService: PromotionService,
    private customerService: CustomerService,
    private publisher: RabbitMQPublisher,
  ) {}

  async createCoupon(ctx: RequestContext, input: CouponRequestInput): Promise<void> {
    const outcome = await this.connection.withTransaction(ctx, (txCtx) =>
      this.findOrCreatePromotion(txCtx, input),
    );
    const request = {
      requestId: input.requestId,
      purpose: input.purpose,
      year: input.year,
      customer: { id: input.customerId },
    };

    if ("failureReason" in outcome) {
      Logger.warn(
        `Coupon request ${input.requestId} failed: ${outcome.failureReason}`,
        "CouponRequest",
      );
      await this.publisher.publish(ROUTING_KEYS.COUPON_FAILED, {
        ...request,
        reason: outcome.failureReason,
      });
      return;
    }

    await this.publisher.publish(ROUTING_KEYS.COUPON_CREATED, {
      ...request,
      channel: { erpChannelId: input.erpChannelId },
      couponCode: outcome.promotion.couponCode,
      discountPercent: discountPercentOf(outcome.promotion),
      endsAt: outcome.promotion.endsAt?.toISOString() ?? null,
    });
  }

  private async findOrCreatePromotion(
    ctx: RequestContext,
    input: CouponRequestInput,
  ): Promise<CouponOutcome> {
    const couponRequestKey = `${input.purpose}:${input.year}:${input.customerId}`;
    const existing = await this.connection.getRepository(ctx, Promotion).findOne({
      where: { customFields: { couponRequestKey } },
    });
    if (existing) {
      Logger.info(
        `Coupon ${couponRequestKey} already exists (${existing.couponCode}), sent again`,
        "CouponRequest",
      );
      return { promotion: existing };
    }

    const channel = await this.connection.getRepository(ctx, Channel).findOne({
      where: { customFields: { erpChannelId: input.erpChannelId } },
    });
    if (!channel) {
      return { failureReason: `Channel with erpChannelId "${input.erpChannelId}" not found` };
    }
    const customer = await this.customerService.findOne(ctx, input.customerId, ["channels"]);
    if (!customer) {
      return { failureReason: `Customer ${input.customerId} not found` };
    }
    if (!customer.channels.some((assigned) => idsAreEqual(assigned.id, channel.id))) {
      return {
        failureReason: `Customer ${input.customerId} is not a customer of channel ${channel.code}`,
      };
    }

    const startsAt = new Date();
    const result = await this.promotionService.createPromotion(ctx, {
      enabled: true,
      startsAt,
      endsAt: new Date(startsAt.getTime() + input.validDays * DAY_MS),
      couponCode: await this.generateUnusedCouponCode(
        ctx,
        COUPON_PREFIXES[input.purpose] ?? "WISKO",
      ),
      usageLimit: 1,
      perCustomerUsageLimit: 1,
      conditions: [
        {
          code: customerCondition.code,
          arguments: [{ name: "customerId", value: String(customer.id) }],
        },
      ],
      actions: [
        {
          code: orderPercentageDiscount.code,
          arguments: [{ name: "discount", value: String(input.discountPercent) }],
        },
      ],
      translations: [
        {
          languageCode: LanguageCode.en,
          name: `${input.purpose} coupon ${input.year}: customer ${input.customerId}`,
        },
      ],
      customFields: { couponRequestKey },
    });
    if (isGraphQlErrorResult(result)) {
      throw new UserInputError(`Coupon ${couponRequestKey}: ${result.message}`);
    }
    await this.promotionService.assignPromotionsToChannel(ctx, {
      promotionIds: [result.id],
      channelId: channel.id,
    });

    Logger.info(
      `Created coupon ${result.couponCode} (${couponRequestKey}) in channel ${channel.code}`,
      "CouponRequest",
    );
    return { promotion: result };
  }

  /**
   * Removes the personal coupons this service made once their end date has passed, used or not, so
   * a promotion per birthday does not pile up. Soft-deleted the Vendure way: orders keep their
   * discount. Promotions staff created are never touched (they have no couponRequestKey).
   */
  async removeExpiredCoupons(ctx: RequestContext, now: Date): Promise<number> {
    let removedCount = 0;
    let expiredCoupons: Promotion[];
    // Batched: a removed coupon leaves the query, so the first page is read again until none is left.
    do {
      expiredCoupons = await this.connection.getRepository(ctx, Promotion).find({
        where: {
          endsAt: LessThan(now),
          deletedAt: IsNull(),
          customFields: { couponRequestKey: Not(IsNull()) },
        },
        order: { id: "ASC" },
        take: EXPIRED_PAGE_SIZE,
      });
      for (const coupon of expiredCoupons) {
        const deletion = await this.promotionService.softDeletePromotion(ctx, coupon.id);
        if (deletion.result !== DeletionResult.DELETED) {
          throw new UserInputError(`Coupon ${coupon.couponCode} could not be removed: ${deletion.message}`);
        }
      }
      removedCount += expiredCoupons.length;
    } while (expiredCoupons.length === EXPIRED_PAGE_SIZE);

    Logger.info(`Removed ${removedCount} expired coupon(s)`, "CouponRequest");
    return removedCount;
  }

  private async generateUnusedCouponCode(ctx: RequestContext, prefix: string): Promise<string> {
    const couponCode = `${prefix}-${generateCouponSuffix()}`;
    const isTaken = await this.connection
      .getRepository(ctx, Promotion)
      .exists({ where: { couponCode } });
    return isTaken ? this.generateUnusedCouponCode(ctx, prefix) : couponCode;
  }
}

export function generateCouponSuffix(): string {
  return Array.from(
    { length: COUPON_RANDOM_LENGTH },
    () => COUPON_ALPHABET[randomInt(COUPON_ALPHABET.length)],
  ).join("");
}

/** The stored percentage, so a repeated request reports the coupon as it was created. */
export function discountPercentOf(promotion: Promotion): number {
  const discount = promotion.actions
    .find((action) => action.code === orderPercentageDiscount.code)
    ?.args.find((arg) => arg.name === "discount");
  return Number(discount?.value);
}

export const expiredCouponCleanupTask = new ScheduledTask({
  id: "wisko-expired-coupon-cleanup",
  description: "Remove personal coupons (e.g. birthday) whose end date has passed, used or not",
  schedule: (cron) => cron.every(1).hours(),
  async execute({ injector, scheduledContext }) {
    const removedCount = await injector
      .get(CouponRequestService)
      .removeExpiredCoupons(scheduledContext, new Date());
    return { removedCount };
  },
});
