import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    OrderStateTransitionEvent,
    ProcessContext,
    Logger,
    OrderService,
    RequestContext,
    Order,
    EntityHydrator,
    Channel,
    ID,
} from '@vendure/core';
import { RabbitMQPublisher } from '../rabbitmq/rabbitmq.publisher';
import { ROUTING_KEYS } from '../rabbitmq/rabbitmq.constants';

const STATE_TO_ROUTING_KEY: Record<string, string> = {
    // ArrangingPayment skipped — no need to publish before payment
    PaymentAuthorized: ROUTING_KEYS.ORDER_PAYMENT_AUTHORIZED,
    PaymentSettled: ROUTING_KEYS.ORDER_PAYMENT_SETTLED,
    Shipped: ROUTING_KEYS.ORDER_SHIPPED,
    PartiallyShipped: ROUTING_KEYS.ORDER_SHIPPED,
    Delivered: ROUTING_KEYS.ORDER_DELIVERED,
    PartiallyDelivered: ROUTING_KEYS.ORDER_DELIVERED,
    Cancelled: ROUTING_KEYS.ORDER_CANCELLED,
};

@Injectable()
export class OrderEventPublisher implements OnApplicationBootstrap {
    constructor(
        private eventBus: EventBus,
        private processContext: ProcessContext,
        private publisher: RabbitMQPublisher,
        private orderService: OrderService,
        private entityHydrator: EntityHydrator,
    ) {}

    onApplicationBootstrap() {
        if (!this.processContext.isServer) return;

        this.eventBus.ofType(OrderStateTransitionEvent).subscribe((event) => {
            const routingKey = STATE_TO_ROUTING_KEY[event.toState];
            if (!routingKey) return;

            // Wrap in immediately-invoked async to catch ALL errors
            (async () => {
                try {
                    const payload = await this.buildOrderPayload(event.ctx, event.order, event.fromState, event.toState);
                    await this.publisher.publish(routingKey, payload);
                } catch (error: any) {
                    Logger.error(`Failed to publish order event: ${error.message}`, 'OrderEventPublisher');
                    Logger.error(error.stack || '', 'OrderEventPublisher');
                }
            })();
        });

        Logger.info('Listening for order state transitions', 'OrderEventPublisher');
    }

    private async buildOrderPayload(
        ctx: RequestContext,
        order: Order,
        fromState: string,
        toState: string,
    ): Promise<Record<string, any>> {
        // Hydrate relations — wrap in try/catch as some may not exist
        try {
            await this.entityHydrator.hydrate(ctx, order, {
                relations: [
                    'customer',
                    'lines',
                    'lines.productVariant',
                    'lines.productVariant.product',
                    'lines.productVariant.product.translations',
                    'shippingLines',
                    'payments',
                    'fulfillments',
                    'channels',
                    'surcharges',
                ],
            });
        } catch (e: any) {
            Logger.warn(`Hydration partial failure: ${e.message}`, 'OrderEventPublisher');
        }

        const channel = order.channels?.find((c: Channel) => c.code !== '__default_channel__') || order.channels?.[0];

        return {
            event: `order.${this.stateToEventName(toState)}`,
            timestamp: new Date().toISOString(),
            fromState,
            toState,
            order: {
                id: String(order.id),
                code: order.code,
                state: toState,
                type: order.type,
                active: order.active,
                orderPlacedAt: order.orderPlacedAt?.toISOString() || null,
                createdAt: order.createdAt?.toISOString(),
                updatedAt: order.updatedAt?.toISOString(),
                currencyCode: order.currencyCode,

                // Totals
                subTotal: order.subTotal,
                subTotalWithTax: order.subTotalWithTax,
                shipping: order.shipping,
                shippingWithTax: order.shippingWithTax,
                total: order.total,
                totalWithTax: order.totalWithTax,
                totalQuantity: order.totalQuantity,

                couponCodes: order.couponCodes || [],

                // Channel
                channel: channel ? {
                    id: String(channel.id),
                    code: channel.code,
                    token: channel.token,
                } : null,

                // Customer
                customer: order.customer ? {
                    id: String(order.customer.id),
                    firstName: order.customer.firstName,
                    lastName: order.customer.lastName,
                    emailAddress: order.customer.emailAddress,
                    phoneNumber: order.customer.phoneNumber || null,
                } : null,

                // Addresses
                shippingAddress: this.serializeAddress(order.shippingAddress),
                billingAddress: this.serializeAddress(order.billingAddress),

                // Lines
                lines: (order.lines || []).map(line => {
                    const slug = (line.productVariant?.product as any)?.slug
                        || (line.productVariant?.product as any)?.translations?.[0]?.slug
                        || null;
                    const erpProductId = slug?.startsWith('erp-') ? slug.slice(4) : null;

                    return {
                        id: String(line.id),
                        quantity: line.quantity,
                        linePrice: line.linePrice,
                        linePriceWithTax: line.linePriceWithTax,
                        discountedLinePrice: line.discountedLinePrice,
                        discountedLinePriceWithTax: line.discountedLinePriceWithTax,
                        unitPrice: line.unitPrice,
                        unitPriceWithTax: line.unitPriceWithTax,
                        taxRate: line.taxRate,
                        productVariant: line.productVariant ? {
                            id: String(line.productVariant.id),
                            sku: line.productVariant.sku,
                            name: line.productVariant.name,
                            price: line.productVariant.price,
                        } : null,
                        product: line.productVariant?.product ? {
                            id: String(line.productVariant.product.id),
                            name: line.productVariant.product.name,
                            slug,
                            erpProductId,
                        } : null,
                    };
                }),

                // Shipping
                shippingLines: (order.shippingLines || []).map(sl => ({
                    shippingMethodId: sl.shippingMethodId ? String(sl.shippingMethodId) : null,
                    price: sl.listPrice,
                    priceWithTax: sl.listPriceIncludesTax ? sl.listPrice : Math.round(sl.listPrice * 1.18),
                })),

                // Discounts
                discounts: order.discounts || [],

                // Payments
                payments: (order.payments || []).map(p => ({
                    id: String(p.id),
                    method: p.method,
                    amount: p.amount,
                    state: p.state,
                    transactionId: p.transactionId || null,
                    errorMessage: p.errorMessage || null,
                    metadata: p.metadata || {},
                })),

                // Fulfillments
                fulfillments: (order.fulfillments || []).map(f => ({
                    id: String(f.id),
                    state: f.state,
                    method: f.method,
                    trackingCode: f.trackingCode || null,
                    createdAt: f.createdAt?.toISOString(),
                })),

                // Surcharges
                surcharges: (order.surcharges || []).map(s => ({
                    id: String(s.id),
                    description: s.description,
                    sku: s.sku || null,
                    price: s.listPrice,
                    priceWithTax: s.listPriceIncludesTax ? s.listPrice : Math.round(s.listPrice * 1.18),
                    taxRate: s.taxRate,
                })),

                // Tax summary
                taxSummary: order.taxSummary || [],
            },
        };
    }

    private serializeAddress(address: any): Record<string, any> | null {
        if (!address) return null;
        return {
            fullName: address.fullName || null,
            company: address.company || null,
            streetLine1: address.streetLine1 || null,
            streetLine2: address.streetLine2 || null,
            city: address.city || null,
            province: address.province || null,
            postalCode: address.postalCode || null,
            country: address.countryCode || address.country || null,
            phoneNumber: address.phoneNumber || null,
        };
    }

    private stateToEventName(state: string): string {
        const map: Record<string, string> = {
            ArrangingPayment: 'placed',
            PaymentAuthorized: 'payment_authorized',
            PaymentSettled: 'payment_settled',
            Shipped: 'shipped',
            PartiallyShipped: 'shipped',
            Delivered: 'delivered',
            PartiallyDelivered: 'delivered',
            Cancelled: 'cancelled',
        };
        return map[state] || state.toLowerCase();
    }
}
