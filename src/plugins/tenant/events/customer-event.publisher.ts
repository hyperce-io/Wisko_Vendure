import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    CustomerEvent,
    CustomerAddressEvent,
    AccountRegistrationEvent,
    ProcessContext,
    Logger,
    EntityHydrator,
    Customer,
    RequestContext,
} from '@vendure/core';
import { RabbitMQPublisher } from '../rabbitmq/rabbitmq.publisher';
import { ROUTING_KEYS } from '../rabbitmq/rabbitmq.constants';

@Injectable()
export class CustomerEventPublisher implements OnApplicationBootstrap {
    constructor(
        private eventBus: EventBus,
        private processContext: ProcessContext,
        private publisher: RabbitMQPublisher,
        private entityHydrator: EntityHydrator,
    ) {}

    onApplicationBootstrap() {
        if (!this.processContext.isServer) return;

        // Customer created/updated/deleted
        this.eventBus.ofType(CustomerEvent).subscribe((event) => {
            (async () => {
                try {
                    const routingKey = this.getCustomerRoutingKey(event.type);
                    if (!routingKey) return;
                    const payload = await this.buildCustomerPayload(event.ctx, event.entity, event.type);
                    await this.publisher.publish(routingKey, payload);
                } catch (error: any) {
                    Logger.error(`Failed to publish customer event: ${error.message}`, 'CustomerEventPublisher');
                }
            })();
        });

        // Customer address created/updated
        this.eventBus.ofType(CustomerAddressEvent).subscribe((event) => {
            (async () => {
                try {
                    const routingKey = event.type === 'created'
                        ? ROUTING_KEYS.CUSTOMER_ADDRESS_CREATED
                        : ROUTING_KEYS.CUSTOMER_ADDRESS_UPDATED;

                    const address = event.entity;
                    const payload = {
                        event: `customer.address_${event.type}`,
                        timestamp: new Date().toISOString(),
                        address: {
                            id: String(address.id),
                            fullName: address.fullName || null,
                            company: address.company || null,
                            streetLine1: address.streetLine1 || null,
                            streetLine2: address.streetLine2 || null,
                            city: address.city || null,
                            province: address.province || null,
                            postalCode: address.postalCode || null,
                            phoneNumber: address.phoneNumber || null,
                            defaultShippingAddress: address.defaultShippingAddress,
                            defaultBillingAddress: address.defaultBillingAddress,
                        },
                        customerId: address.customer?.id ? String(address.customer.id) : null,
                    };
                    await this.publisher.publish(routingKey, payload);
                } catch (error: any) {
                    Logger.error(`Failed to publish address event: ${error.message}`, 'CustomerEventPublisher');
                }
            })();
        });

        // Account registration
        this.eventBus.ofType(AccountRegistrationEvent).subscribe((event) => {
            (async () => {
                try {
                    const payload = {
                        event: 'customer.registered',
                        timestamp: new Date().toISOString(),
                        user: {
                            id: String(event.user.id),
                            identifier: event.user.identifier,
                        },
                        channelCode: event.ctx.channel?.code || null,
                    };
                    await this.publisher.publish(ROUTING_KEYS.CUSTOMER_REGISTERED, payload);
                } catch (error: any) {
                    Logger.error(`Failed to publish registration event: ${error.message}`, 'CustomerEventPublisher');
                }
            })();
        });

        Logger.info('Listening for customer events', 'CustomerEventPublisher');
    }

    private getCustomerRoutingKey(type: 'created' | 'updated' | 'deleted'): string | null {
        switch (type) {
            case 'created': return ROUTING_KEYS.CUSTOMER_REGISTERED;
            case 'updated': return ROUTING_KEYS.CUSTOMER_UPDATED;
            case 'deleted': return ROUTING_KEYS.CUSTOMER_DELETED;
            default: return null;
        }
    }

    private async buildCustomerPayload(
        ctx: RequestContext,
        customer: Customer,
        type: string,
    ): Promise<Record<string, any>> {
        await this.entityHydrator.hydrate(ctx, customer, {
            relations: ['channels', 'addresses'],
        });

        const channel = customer.channels?.find(c => c.code !== '__default_channel__') || customer.channels?.[0];
        const erpChannelId = channel?.customFields?.erpChannelId || null;

        return {
            event: `customer.${type}`,
            timestamp: new Date().toISOString(),
            customer: {
                id: String(customer.id),
                firstName: customer.firstName,
                lastName: customer.lastName,
                emailAddress: customer.emailAddress,
                phoneNumber: customer.phoneNumber || null,
                createdAt: customer.createdAt?.toISOString(),
                updatedAt: customer.updatedAt?.toISOString(),
            },
            addresses: (customer.addresses || []).map(a => ({
                id: String(a.id),
                fullName: a.fullName,
                company: a.company || null,
                streetLine1: a.streetLine1 || null,
                streetLine2: a.streetLine2 || null,
                city: a.city || null,
                province: a.province || null,
                postalCode: a.postalCode || null,
                phoneNumber: a.phoneNumber || null,
                defaultShippingAddress: a.defaultShippingAddress,
                defaultBillingAddress: a.defaultBillingAddress,
            })),
            channel: channel ? {
                id: String(channel.id),
                code: channel.code,
                erpChannelId,
            } : null,
        };
    }
}
