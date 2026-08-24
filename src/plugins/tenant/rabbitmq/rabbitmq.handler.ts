import { Injectable } from '@nestjs/common';
import {
    Logger,
    RequestContextService,
    TransactionalConnection,
    ConfigService,
    User,
    RequestContext,
} from '@vendure/core';
import { TenantService } from '../services/tenant.service';
import { ProductSyncService } from '../services/product-sync.service';
import { ROUTING_KEYS } from './rabbitmq.constants';
import {
    SyncCompanyInput,
    SyncTenantInput,
    SyncChannelInput,
    SyncAdminInput,
    SyncProductInput,
    AssignProductToChannelInput,
    RemoveProductFromChannelInput,
} from '../types';

@Injectable()
export class RabbitMQMessageHandler {
    constructor(
        private tenantService: TenantService,
        private productSyncService: ProductSyncService,
        private requestContextService: RequestContextService,
        private connection: TransactionalConnection,
        private configService: ConfigService,
    ) {}

    private async getSuperAdminCtx(): Promise<RequestContext> {
        const { superadminCredentials } = this.configService.authOptions;
        const user = await this.connection.rawConnection.getRepository(User).findOneOrFail({
            where: { identifier: superadminCredentials.identifier },
            relations: { roles: { channels: true } },
        });
        return this.requestContextService.create({ apiType: 'admin', user });
    }

    async handle(routingKey: string, payload: any): Promise<void> {
        const ctx = await this.getSuperAdminCtx();

        switch (routingKey) {
            // Company
            case ROUTING_KEYS.COMPANY_CREATED:
            case ROUTING_KEYS.COMPANY_UPDATED:
                await this.handleCompanySync(ctx, payload);
                break;
            case ROUTING_KEYS.COMPANY_DELETED:
                await this.handleCompanyDelete(ctx, payload);
                break;

            // Tenant
            case ROUTING_KEYS.TENANT_CREATED:
            case ROUTING_KEYS.TENANT_UPDATED:
                await this.handleTenantSync(ctx, payload);
                break;
            case ROUTING_KEYS.TENANT_DELETED:
                await this.handleTenantDelete(ctx, payload);
                break;

            // Channel
            case ROUTING_KEYS.CHANNEL_CREATED:
            case ROUTING_KEYS.CHANNEL_UPDATED:
                await this.handleChannelSync(ctx, payload);
                break;
            case ROUTING_KEYS.CHANNEL_DELETED:
                await this.handleChannelDelete(ctx, payload);
                break;

            // Admin
            case ROUTING_KEYS.ADMIN_CREATED:
            case ROUTING_KEYS.ADMIN_UPDATED:
                await this.handleAdminSync(ctx, payload);
                break;
            case ROUTING_KEYS.ADMIN_DEACTIVATED:
                await this.handleAdminDeactivate(ctx, payload);
                break;

            // Product
            case ROUTING_KEYS.PRODUCT_CREATED:
            case ROUTING_KEYS.PRODUCT_UPDATED:
                await this.handleProductSync(ctx, payload);
                break;
            case ROUTING_KEYS.PRODUCT_DELETED:
                await this.handleProductDelete(ctx, payload);
                break;
            case ROUTING_KEYS.PRODUCT_ASSIGNED:
                await this.handleProductAssign(ctx, payload);
                break;
            case ROUTING_KEYS.PRODUCT_REMOVED:
                await this.handleProductRemove(ctx, payload);
                break;

            // Full sync
            case ROUTING_KEYS.SYNC_FULL:
                await this.handleFullSync(ctx, payload);
                break;

            default:
                Logger.warn(`Unknown routing key: ${routingKey}`, 'RabbitMQHandler');
        }
    }

    // ---- Company ----

    private async handleCompanySync(ctx: RequestContext, payload: any) {
        const { company } = payload;
        if (!company?.code) throw new Error('company.code is required');
        const input: SyncCompanyInput = {
            code: company.code, name: company.name, enabled: company.enabled, admin: company.admin,
        };
        await this.tenantService.syncCompany(ctx, input);
    }

    private async handleCompanyDelete(ctx: RequestContext, payload: any) {
        if (!payload.company?.code) throw new Error('company.code is required');
        await this.tenantService.disableCompany(ctx, payload.company.code);
    }

    // ---- Tenant ----

    private async handleTenantSync(ctx: RequestContext, payload: any) {
        const { company, tenant } = payload;
        if (!company?.code) throw new Error('company.code is required for tenant sync');
        if (!tenant?.code) throw new Error('tenant.code is required');
        const input: SyncTenantInput = {
            companyCode: company.code, code: tenant.code, name: tenant.name, enabled: tenant.enabled, admin: tenant.admin,
        };
        await this.tenantService.syncTenant(ctx, input);
    }

    private async handleTenantDelete(ctx: RequestContext, payload: any) {
        if (!payload.tenant?.code) throw new Error('tenant.code is required');
        await this.tenantService.disableTenant(ctx, payload.tenant.code);
    }

    // ---- Channel ----

    private async handleChannelSync(ctx: RequestContext, payload: any) {
        const { company, tenant, channel } = payload;
        if (!company?.code) throw new Error('company.code is required');
        if (!tenant?.code) throw new Error('tenant.code is required');
        if (!channel?.erpChannelId) throw new Error('channel.erpChannelId is required');
        const input: SyncChannelInput = {
            companyCode: company.code, tenantCode: tenant.code, erpChannelId: channel.erpChannelId,
            code: channel.code, name: channel.name,
            defaultCurrencyCode: channel.defaultCurrencyCode, defaultLanguageCode: channel.defaultLanguageCode,
            pricesIncludeTax: channel.pricesIncludeTax,
        };
        await this.tenantService.syncChannel(ctx, input);
    }

    private async handleChannelDelete(ctx: RequestContext, payload: any) {
        if (!payload.channel?.erpChannelId) throw new Error('channel.erpChannelId is required');
        await this.tenantService.deleteChannel(ctx, payload.channel.erpChannelId);
    }

    // ---- Admin ----

    private async handleAdminSync(ctx: RequestContext, payload: any) {
        const { company, tenant, admin } = payload;
        if (!admin?.email) throw new Error('admin.email is required');
        const input: SyncAdminInput = {
            companyCode: company?.code, tenantCode: tenant?.code,
            email: admin.email, password: admin.password,
            firstName: admin.firstName, lastName: admin.lastName,
            role: admin.role || 'tenant-admin', channelCodes: admin.channelCodes,
        };
        await this.tenantService.syncAdmin(ctx, input);
    }

    private async handleAdminDeactivate(ctx: RequestContext, payload: any) {
        if (!payload.admin?.email) throw new Error('admin.email is required');
        await this.tenantService.deactivateAdmin(ctx, payload.admin.email);
    }

    // ---- Product ----

    private async handleProductSync(ctx: RequestContext, payload: any) {
        const { product } = payload;
        if (!product?.erpProductId) throw new Error('product.erpProductId is required');
        if (!product?.name) throw new Error('product.name is required');
        const input: SyncProductInput = {
            erpProductId: product.erpProductId,
            name: product.name,
            slug: product.slug,
            description: product.description,
            enabled: product.enabled,
            variants: product.variants || [],
            channelCodes: product.channelCodes,
        };
        await this.productSyncService.syncProduct(ctx, input);
    }

    private async handleProductDelete(ctx: RequestContext, payload: any) {
        if (!payload.product?.erpProductId) throw new Error('product.erpProductId is required');
        await this.productSyncService.deleteProduct(ctx, payload.product.erpProductId);
    }

    private async handleProductAssign(ctx: RequestContext, payload: any) {
        const { product } = payload;
        if (!product?.erpProductId) throw new Error('product.erpProductId is required');
        if (!product?.channelCodes?.length) throw new Error('product.channelCodes is required');
        await this.productSyncService.assignToChannels(ctx, product.erpProductId, product.channelCodes);
    }

    private async handleProductRemove(ctx: RequestContext, payload: any) {
        const { product } = payload;
        if (!product?.erpProductId) throw new Error('product.erpProductId is required');
        if (!product?.channelCodes?.length) throw new Error('product.channelCodes is required');
        await this.productSyncService.removeFromChannels(ctx, product.erpProductId, product.channelCodes);
    }

    // ---- Full Sync ----

    private async handleFullSync(ctx: RequestContext, payload: any) {
        Logger.info('Full sync started', 'RabbitMQHandler');

        if (payload.company) {
            await this.handleCompanySync(ctx, payload);
        }

        const tenants = payload.tenants || (payload.tenant ? [payload.tenant] : []);
        for (const tenant of tenants) {
            await this.handleTenantSync(ctx, { company: payload.company, tenant });
            const channels = tenant.channels || [];
            for (const channel of channels) {
                await this.handleChannelSync(ctx, { company: payload.company, tenant, channel });
            }
        }

        if (payload.channel && !payload.tenants) {
            await this.handleChannelSync(ctx, payload);
        }
        if (payload.channels && !payload.tenants) {
            for (const channel of payload.channels) {
                await this.handleChannelSync(ctx, { company: payload.company, tenant: payload.tenant, channel });
            }
        }

        // Products in full sync
        const products = payload.products || [];
        for (const product of products) {
            await this.handleProductSync(ctx, { product });
        }

        Logger.info('Full sync completed', 'RabbitMQHandler');
    }
}
