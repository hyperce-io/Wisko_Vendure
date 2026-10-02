export const RABBITMQ_EXCHANGE = "wisko.sync";
export const RABBITMQ_QUEUE = "wisko.sync.vendure";
export const RABBITMQ_DLX_EXCHANGE = "wisko.sync.dlx";
export const RABBITMQ_DLQ = "wisko.sync.vendure.dlq";

export const ROUTING_KEYS = {
  COMPANY_CREATED: "company.created",
  COMPANY_UPDATED: "company.updated",
  COMPANY_DELETED: "company.deleted",

  TENANT_CREATED: "tenant.created",
  TENANT_UPDATED: "tenant.updated",
  TENANT_DELETED: "tenant.deleted",

  CHANNEL_CREATED: "channel.created",
  CHANNEL_UPDATED: "channel.updated",
  CHANNEL_DELETED: "channel.deleted",

  ADMIN_CREATED: "admin.created",
  ADMIN_UPDATED: "admin.updated",
  ADMIN_DEACTIVATED: "admin.deactivated",

  PRODUCT_CREATED: "product.created",
  PRODUCT_UPDATED: "product.updated",
  PRODUCT_DELETED: "product.deleted",
  PRODUCT_ASSIGNED: "product.assigned",
  PRODUCT_REMOVED: "product.removed",

  STOCK_LEVEL_CHANGED: "stock.level_changed",

  ORDER_PLACED: "order.placed",
  ORDER_PAYMENT_AUTHORIZED: "order.payment_authorized",
  ORDER_PAYMENT_SETTLED: "order.payment_settled",
  ORDER_SHIPPED: "order.shipped",
  ORDER_DELIVERED: "order.delivered",
  ORDER_CANCELLED: "order.cancelled",

  CUSTOMER_REGISTERED: "customer.registered",
  CUSTOMER_UPDATED: "customer.updated",
  CUSTOMER_DELETED: "customer.deleted",
  CUSTOMER_ADDRESS_CREATED: "customer.address_created",
  CUSTOMER_ADDRESS_UPDATED: "customer.address_updated",

  // Inbound only. Deliberately NOT under `order.*`: Vendure publishes its own
  // order events to this same exchange, so binding `order.*` would feed them back in.
  INVOICE_CREATED: "invoice.created",
  INVOICE_STATUS_CHANGED: "invoice.status_changed",
  INVOICE_CANCELLED: "invoice.cancelled",

  SHIPPING_METHOD_CREATED: "shipping_method.created",
  SHIPPING_METHOD_UPDATED: "shipping_method.updated",
  SHIPPING_METHOD_DELETED: "shipping_method.deleted",
  PAYMENT_METHOD_CREATED: "payment_method.created",
  PAYMENT_METHOD_UPDATED: "payment_method.updated",
  PAYMENT_METHOD_DELETED: "payment_method.deleted",

  TAX_CATEGORY_UPDATED: "tax_category.updated",

  B2B_CUSTOMER_UPSERTED: "b2b_customer.upserted",

  // Outbound only: ids Vendure created, written back onto the ERP records (drained by the ERP's
  // wisko.integrations.vendure_sync.drain_vendure_reply_queue).
  ERP_SYNC_REPLY: "vendure.erp-sync.reply",

  SYNC_FULL: "sync.full",
} as const;
