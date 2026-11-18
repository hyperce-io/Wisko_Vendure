import { Injectable } from '@nestjs/common';
import { SortOrder } from '@vendure/common/lib/generated-types';
import {
    Logger,
    Order,
    OrderService,
    RelationPaths,
    RequestContext,
    ScheduledTask,
    TransactionalConnection,
    translateDeep,
} from '@vendure/core';
import { RabbitMQPublisher } from '../rabbitmq/rabbitmq.publisher';
import { ROUTING_KEYS } from '../rabbitmq/rabbitmq.constants';
import { resolveErpChannel } from './erp-channel.resolver';

export const CART_CHECK_INTERVAL_MINUTES = 5;
const DEFAULT_CART_ABANDONED_AFTER_MINUTES = 30;
const CART_PAGE_SIZE = 100;
const MINUTE_MS = 60_000;

const CART_RELATIONS: RelationPaths<Order> = [
    'customer',
    'channels',
    'lines',
    'lines.productVariant',
    'lines.productVariant.translations',
    'lines.productVariant.product',
    'lines.productVariant.product.translations',
];

/**
 * The carts whose idle period ends in this run: last changed in the interval that is exactly
 * `idleMinutes` older than the run's slot. Consecutive runs cover consecutive intervals, so each
 * idle period is published once, without storing anything on the order (saving the order would
 * move its `updatedAt`, which is the idle clock itself). A run that never happens skips its carts.
 */
export function idleCartWindow(now: Date, idleMinutes: number): { start: Date; end: Date } {
    const intervalMs = CART_CHECK_INTERVAL_MINUTES * MINUTE_MS;
    const slotStart = Math.floor(now.getTime() / intervalMs) * intervalMs;
    const end = slotStart - idleMinutes * MINUTE_MS;
    return { start: new Date(end - intervalMs), end: new Date(end) };
}

@Injectable()
export class AbandonedCartPublisher {
    constructor(
        private orderService: OrderService,
        private publisher: RabbitMQPublisher,
        private connection: TransactionalConnection,
    ) {}

    async publishAbandonedCarts(ctx: RequestContext, now: Date): Promise<number> {
        const idleMinutes =
            Number(process.env.CART_ABANDONED_AFTER_MINUTES) || DEFAULT_CART_ABANDONED_AFTER_MINUTES;
        const window = idleCartWindow(now, idleMinutes);
        let publishedCount = 0;
        let skip = 0;
        let totalItems = 0;
        // Batched: one window can hold many carts.
        do {
            const page = await this.orderService.findAll(
                ctx,
                {
                    filter: {
                        active: { eq: true },
                        state: { in: ['AddingItems', 'ArrangingPayment'] },
                        totalQuantity: { gt: 0 },
                        updatedAt: { after: window.start, before: window.end },
                    },
                    sort: { id: SortOrder.ASC },
                    take: CART_PAGE_SIZE,
                    skip,
                },
                CART_RELATIONS,
            );
            totalItems = page.totalItems;
            skip += CART_PAGE_SIZE;
            const abandonedCarts = page.items.filter(
                order => order.lines.length > 0 && !!order.customer?.emailAddress,
            );
            for (const order of abandonedCarts) {
                const payload = await this.buildCartPayload(ctx, order, idleMinutes);
                if (await this.publisher.publish(ROUTING_KEYS.CART_ABANDONED, payload)) {
                    publishedCount++;
                }
            }
        } while (skip < totalItems);

        Logger.info(
            `Published ${publishedCount} abandoned cart(s) last changed ${window.start.toISOString()} - ${window.end.toISOString()}`,
            'AbandonedCartPublisher',
        );
        return publishedCount;
    }

    async buildCartPayload(ctx: RequestContext, order: Order, idleMinutes: number) {
        const channel = await resolveErpChannel(this.connection, ctx, order.channels);
        return {
            channel: { erpChannelId: channel?.erpChannelId ?? null },
            cart: {
                id: String(order.id),
                code: order.code,
                updatedAt: order.updatedAt.toISOString(),
                abandonedAt: new Date(order.updatedAt.getTime() + idleMinutes * MINUTE_MS).toISOString(),
                currencyCode: order.currencyCode,
                totalWithTax: order.totalWithTax,
                cartUrl: process.env.STOREFRONT_CART_URL || null,
                customer: order.customer
                    ? {
                          id: String(order.customer.id),
                          emailAddress: order.customer.emailAddress,
                          firstName: order.customer.firstName,
                          lastName: order.customer.lastName,
                      }
                    : null,
                lines: order.lines.map(line => {
                    const productVariant = translateDeep(
                        line.productVariant,
                        [ctx.languageCode, ctx.channel.defaultLanguageCode],
                        ['product'],
                    );
                    return {
                        quantity: line.quantity,
                        linePriceWithTax: line.linePriceWithTax,
                        productVariant: {
                            id: String(productVariant.id),
                            sku: productVariant.sku,
                            name: productVariant.name,
                        },
                        product: {
                            id: String(productVariant.product.id),
                            name: productVariant.product.name,
                            slug: productVariant.product.slug,
                        },
                    };
                }),
            },
        };
    }
}

export const abandonedCartTask = new ScheduledTask({
    id: 'wisko-cart-abandoned',
    description: 'Publish cart.abandoned for carts idle for CART_ABANDONED_AFTER_MINUTES',
    schedule: cron => cron.every(CART_CHECK_INTERVAL_MINUTES).minutes(),
    async execute({ injector, scheduledContext }) {
        const publishedCount = await injector
            .get(AbandonedCartPublisher)
            .publishAbandonedCarts(scheduledContext, new Date());
        return { publishedCount };
    },
});
