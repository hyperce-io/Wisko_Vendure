export const RABBITMQ_EXCHANGE = 'wisko.sync';
export const RABBITMQ_QUEUE = 'wisko.sync.vendure';
export const RABBITMQ_DLX_EXCHANGE = 'wisko.sync.dlx';
export const RABBITMQ_DLQ = 'wisko.sync.vendure.dlq';

export const ROUTING_KEYS = {
    COMPANY_CREATED: 'company.created',
    COMPANY_UPDATED: 'company.updated',
    COMPANY_DELETED: 'company.deleted',

    TENANT_CREATED: 'tenant.created',
    TENANT_UPDATED: 'tenant.updated',
    TENANT_DELETED: 'tenant.deleted',

    CHANNEL_CREATED: 'channel.created',
    CHANNEL_UPDATED: 'channel.updated',
    CHANNEL_DELETED: 'channel.deleted',

    ADMIN_CREATED: 'admin.created',
    ADMIN_UPDATED: 'admin.updated',
    ADMIN_DEACTIVATED: 'admin.deactivated',

    PRODUCT_CREATED: 'product.created',
    PRODUCT_UPDATED: 'product.updated',
    PRODUCT_DELETED: 'product.deleted',
    PRODUCT_ASSIGNED: 'product.assigned',
    PRODUCT_REMOVED: 'product.removed',

    ORDER_PLACED: 'order.placed',
    ORDER_PAYMENT_AUTHORIZED: 'order.payment_authorized',
    ORDER_PAYMENT_SETTLED: 'order.payment_settled',
    ORDER_SHIPPED: 'order.shipped',
    ORDER_DELIVERED: 'order.delivered',
    ORDER_CANCELLED: 'order.cancelled',

    SYNC_FULL: 'sync.full',
} as const;
