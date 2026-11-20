import { Injectable } from "@nestjs/common";
import { DeletionResult } from "@vendure/common/lib/generated-types";
import { randomInt } from "crypto";
import { IsNull, LessThan, MoreThan, Not } from "typeorm";
import {
  Channel,
  ChannelService,
  Customer,
  CustomerGroupService,
  ID,
  LanguageCode,
  Logger,
  Promotion,
  PromotionService,
  RequestContext,
  ScheduledTask,
  TransactionalConnection,
  UserInputError,
  customerGroup,
  isGraphQlErrorResult,
  orderPercentageDiscount,
} from "@vendure/core";
import { ROUTING_KEYS } from "../rabbitmq/rabbitmq.constants";
import { RabbitMQPublisher } from "../rabbitmq/rabbitmq.publisher";

const COUPON_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const COUPON_RANDOM_LENGTH = 6;
const EXPIRED_PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_DAY_MS = DAY_MS / 2;
const BIRTHDAY_TIMEZONE = process.env.BIRTHDAY_TIMEZONE || "UTC";

export interface BirthdayDay {
  date: string;
  startsAt: Date;
  endsAt: Date;
}

/**
 * A date of birth as YYYY-MM-DD. The admin saves it as local midnight, which east of UTC is the
 * evening before in UTC, so it is rounded to the nearest day.
 */
export function birthDateOf(dateOfBirth: Date): string {
  return new Date(dateOfBirth.getTime() + HALF_DAY_MS).toISOString().slice(0, 10);
}

/** The calendar day `now` falls on in `timeZone`, from its first to its last millisecond. */
export function birthdayDayOf(now: Date, timeZone: string): BirthdayDay {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const utcOffsetMs = wallClockAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  const startsAt = new Date(Date.parse(`${date}T00:00:00Z`) - utcOffsetMs);
  return { date, startsAt, endsAt: new Date(startsAt.getTime() + DAY_MS - 1) };
}

/** Birthdays celebrated on `date` (MM-DD): 29 February birthdays fall on the 28th in other years. */
export function birthdaysOn(date: string): string[] {
  const monthDay = date.slice(5);
  const year = Number(date.slice(0, 4));
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return monthDay === "02-28" && !isLeapYear ? [monthDay, "02-29"] : [monthDay];
}

/**
 * FSD-UC-MA-005 birthday discount: each day, in every store with a Birthday discount (%) set, one customer group of the customers whose
 * birthday it is and one promotion for that group with a shared code, valid that day only and once
 * per customer. Mautic is told the code (birthday.promotion_created) for the birthday email.
 * Keyed by `couponRequestKey` (birthday:date:channelId), so running twice in a day creates nothing new.
 */
@Injectable()
export class BirthdayPromotionService {
  constructor(
    private connection: TransactionalConnection,
    private promotionService: PromotionService,
    private customerGroupService: CustomerGroupService,
    private channelService: ChannelService,
    private publisher: RabbitMQPublisher,
  ) {}

  async createTodaysPromotions(ctx: RequestContext, now: Date): Promise<number> {
    const discountingChannels = await this.connection.getRepository(ctx, Channel).find({
      where: { customFields: { erpChannelId: Not(IsNull()), birthdayDiscountPercent: MoreThan(0) } },
    });
    if (discountingChannels.length === 0) {
      return 0;
    }
    const day = birthdayDayOf(now, BIRTHDAY_TIMEZONE);
    const customerIdsByChannelId = await this.findBirthdayCustomers(
      ctx,
      discountingChannels.map((channel) => channel.id),
      birthdaysOn(day.date),
    );
    const storeChannels = discountingChannels.filter((channel) =>
      customerIdsByChannelId.has(String(channel.id)),
    );

    for (const channel of storeChannels) {
      const customerIds = customerIdsByChannelId.get(String(channel.id)) ?? [];
      const promotion = await this.connection.withTransaction(ctx, (txCtx) =>
        this.findOrCreatePromotion(txCtx, channel, customerIds, day),
      );
      await this.publisher.publish(ROUTING_KEYS.BIRTHDAY_PROMOTION_CREATED, {
        date: day.date,
        channel: { erpChannelId: channel.customFields.erpChannelId },
        couponCode: promotion.couponCode,
        discountPercent: discountPercentOf(promotion),
        startsAt: day.startsAt.toISOString(),
        endsAt: day.endsAt.toISOString(),
        customers: customerIds.map((customerId) => ({ id: String(customerId) })),
      });
    }

    Logger.info(
      `Birthday promotions for ${day.date}: ${storeChannels.length} store(s)`,
      "BirthdayPromotion",
    );
    return storeChannels.length;
  }

  /**
   * Removes the birthday promotions whose day has passed, used or not, and their customer group.
   * Soft-deleted the Vendure way: orders keep their discount. Staff promotions have no
   * couponRequestKey and are never touched.
   */
  async removeExpiredCoupons(ctx: RequestContext, now: Date): Promise<number> {
    let removedCount = 0;
    let expiredCoupons: Promotion[];
    // Batched: a removed promotion leaves the query, so the first page is read again until none is left.
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
        const customerGroupId = customerGroupIdOf(coupon);
        if (customerGroupId) {
          await this.customerGroupService.delete(ctx, customerGroupId);
        }
      }
      removedCount += expiredCoupons.length;
    } while (expiredCoupons.length === EXPIRED_PAGE_SIZE);

    Logger.info(`Removed ${removedCount} expired coupon(s)`, "BirthdayPromotion");
    return removedCount;
  }

  private async findBirthdayCustomers(
    ctx: RequestContext,
    channelIds: ID[],
    birthdays: string[],
  ): Promise<Map<string, ID[]>> {
    const rows: Array<{ customerId: ID; channelId: ID }> = await this.connection
      .getRepository(ctx, Customer)
      .createQueryBuilder("customer")
      .innerJoin("customer.channels", "channel")
      .select("customer.id", "customerId")
      .addSelect("channel.id", "channelId")
      .where("customer.deletedAt IS NULL")
      .andWhere("channel.id IN (:...channelIds)", { channelIds })
      .andWhere(
        `TO_CHAR("customer"."customFieldsDateofbirth" + INTERVAL '12 hours', 'MM-DD') IN (:...birthdays)`,
        { birthdays },
      )
      .getRawMany();

    return rows.reduce((customerIdsByChannelId, { customerId, channelId }) => {
      const channelKey = String(channelId);
      customerIdsByChannelId.set(channelKey, [...(customerIdsByChannelId.get(channelKey) ?? []), customerId]);
      return customerIdsByChannelId;
    }, new Map<string, ID[]>());
  }

  private async findOrCreatePromotion(
    ctx: RequestContext,
    channel: Channel,
    customerIds: ID[],
    day: BirthdayDay,
  ): Promise<Promotion> {
    const couponRequestKey = `birthday:${day.date}:${channel.id}`;
    const existing = await this.connection.getRepository(ctx, Promotion).findOne({
      where: { customFields: { couponRequestKey } },
    });
    if (existing) {
      return existing;
    }

    const name = `Birthday ${day.date} · ${channel.code}`;
    const group = await this.customerGroupService.create(ctx, { name, customerIds });
    const result = await this.promotionService.createPromotion(ctx, {
      enabled: true,
      startsAt: day.startsAt,
      endsAt: day.endsAt,
      couponCode: await this.generateUnusedCouponCode(ctx),
      perCustomerUsageLimit: 1,
      conditions: [
        {
          code: customerGroup.code,
          arguments: [{ name: "customerGroupId", value: String(group.id) }],
        },
      ],
      actions: [
        {
          code: orderPercentageDiscount.code,
          arguments: [{ name: "discount", value: String(channel.customFields.birthdayDiscountPercent) }],
        },
      ],
      translations: [{ languageCode: LanguageCode.en, name }],
      customFields: { couponRequestKey },
    });
    if (isGraphQlErrorResult(result)) {
      throw new UserInputError(`Birthday promotion ${couponRequestKey}: ${result.message}`);
    }
    await this.channelService.assignToChannels(ctx, Promotion, result.id, [channel.id]);

    Logger.info(
      `Created birthday promotion ${result.couponCode} for ${customerIds.length} customer(s) in channel ${channel.code}`,
      "BirthdayPromotion",
    );
    return result;
  }

  private async generateUnusedCouponCode(ctx: RequestContext): Promise<string> {
    const couponCode = `BDAY-${generateCouponSuffix()}`;
    const isTaken = await this.connection
      .getRepository(ctx, Promotion)
      .exists({ where: { couponCode } });
    return isTaken ? this.generateUnusedCouponCode(ctx) : couponCode;
  }
}

export function generateCouponSuffix(): string {
  return Array.from(
    { length: COUPON_RANDOM_LENGTH },
    () => COUPON_ALPHABET[randomInt(COUPON_ALPHABET.length)],
  ).join("");
}

/** The stored percentage, so a repeated run reports the promotion as it was created. */
export function discountPercentOf(promotion: Promotion): number {
  const discount = promotion.actions
    .find((action) => action.code === orderPercentageDiscount.code)
    ?.args.find((arg) => arg.name === "discount");
  return Number(discount?.value);
}

function customerGroupIdOf(promotion: Promotion): string | undefined {
  return promotion.conditions
    .find((condition) => condition.code === customerGroup.code)
    ?.args.find((arg) => arg.name === "customerGroupId")?.value;
}

export const birthdayPromotionTask = new ScheduledTask({
  id: "wisko-birthday-promotions",
  description: "Create today's birthday customer group and promotion in every store",
  schedule: (cron) => cron.everyDayAt(0, 5),
  timezone: BIRTHDAY_TIMEZONE,
  async execute({ injector, scheduledContext }) {
    const storeCount = await injector
      .get(BirthdayPromotionService)
      .createTodaysPromotions(scheduledContext, new Date());
    return { storeCount };
  },
});

export const expiredCouponCleanupTask = new ScheduledTask({
  id: "wisko-expired-coupon-cleanup",
  description: "Remove birthday promotions whose day has passed, used or not, with their customer group",
  schedule: (cron) => cron.every(1).hours(),
  async execute({ injector, scheduledContext }) {
    const removedCount = await injector
      .get(BirthdayPromotionService)
      .removeExpiredCoupons(scheduledContext, new Date());
    return { removedCount };
  },
});
