import { PluginCommonModule, RuntimeVendureConfig, VendurePlugin } from '@vendure/core';
import { Tenant } from './entities/tenant.entity';
import { Company } from './entities/company.entity';
import { TenantService } from './services/tenant.service';
import { ProductSyncService } from './services/product-sync.service';
import { TenantChannelHandler } from './events/tenant-channel.handler';
import { TenantBoundaryGuard } from './guards/tenant-boundary.guard';
import { TenantAdminResolver } from './api/tenant-admin.resolver';
import { adminApiExtensions } from './api/api-extensions';
import { RabbitMQConsumer } from './rabbitmq/rabbitmq.consumer';
import { RabbitMQMessageHandler } from './rabbitmq/rabbitmq.handler';
import './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [Tenant, Company],
    compatibility: '^3.0.0',
    providers: [
        TenantService,
        ProductSyncService,
        TenantChannelHandler,
        TenantBoundaryGuard,
        RabbitMQConsumer,
        RabbitMQMessageHandler,
    ],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [TenantAdminResolver],
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
