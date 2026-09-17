import { Asset, PluginCommonModule, RuntimeVendureConfig, VendurePlugin } from '@vendure/core';
import { Tenant } from './entities/tenant.entity';
import { Company } from './entities/company.entity';
import { TenantService } from './services/tenant.service';
import { ProductSyncService } from './services/product-sync.service';
import { InvoiceSyncService } from './services/invoice-sync.service';
import { TenantChannelHandler } from './events/tenant-channel.handler';
import { OrderEventPublisher } from './events/order-event.publisher';
import { CustomerEventPublisher } from './events/customer-event.publisher';
import { TenantBoundaryGuard } from './guards/tenant-boundary.guard';
import { TenantAdminResolver } from './api/tenant-admin.resolver';
import { TenantShopResolver } from './api/tenant-shop.resolver';
import { adminApiExtensions } from './api/api-extensions';
import { shopApiExtensions } from './api/shop-api-extensions';
import { RabbitMQConsumer } from './rabbitmq/rabbitmq.consumer';
import { RabbitMQPublisher } from './rabbitmq/rabbitmq.publisher';
import { RabbitMQMessageHandler } from './rabbitmq/rabbitmq.handler';
import './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [Tenant, Company],
    compatibility: '^3.0.0',
    providers: [
        TenantService,
        ProductSyncService,
        InvoiceSyncService,
        TenantChannelHandler,
        OrderEventPublisher,
        CustomerEventPublisher,
        TenantBoundaryGuard,
        RabbitMQConsumer,
        RabbitMQPublisher,
        RabbitMQMessageHandler,
    ],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [TenantAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [TenantShopResolver],
    },
    dashboard: './dashboard/index.tsx',
    configuration: (config: RuntimeVendureConfig) => {
        config.customFields.Channel.push(
            {
                name: 'tenant',
                type: 'relation',
                entity: Tenant,
                nullable: true,
                internal: true,
            },
            {
                name: 'erpChannelId',
                type: 'string',
                unique: true,
                nullable: true,
                internal: false,
                readonly: true,
                label: [{ languageCode: 'en' as any, value: 'ERP Channel ID' }],
            },
        );
        config.customFields.Order.push(
            {
                // The ERP invoice PDF, downloaded from ERP's expiring SAS link
                // and stored permanently. See InvoiceSyncService.
                name: 'erpInvoice',
                type: 'relation',
                entity: Asset,
                nullable: true,
                readonly: true,
                label: [{ languageCode: 'en' as any, value: 'ERP Invoice' }],
                // Rendered as a download link; see ErpInvoiceLink in the dashboard extension.
                ui: { component: 'wisko.erp-invoice-link' },
            },
            {
                // Dedupe key from ERP, so a redelivered message is not re-downloaded.
                name: 'erpInvoiceKey',
                type: 'string',
                nullable: true,
                internal: true,
            },
        );
        config.customFields.Administrator.push({
            name: 'tenant',
            type: 'relation',
            entity: Tenant,
            nullable: true,
            internal: true,
        });
        return config;
    },
})
export class TenantPlugin {}
