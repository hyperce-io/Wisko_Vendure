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
import { ROUTING_KEYS } from './rabbitmq.constants';
import {
    SyncCompanyInput,
    SyncTenantInput,
    SyncChannelInput,
    SyncAdminInput,
} from '../types';

@Injectable()
export class RabbitMQMessageHandler {
    constructor(
        private tenantService: TenantService,
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
            case ROUTING_KEYS.COMPANY_CREATED:
            case ROUTING_KEYS.COMPANY_UPDATED:
                await this.handleCompanySync(ctx, payload);
                break;

            case ROUTING_KEYS.COMPANY_DELETED:
                await this.handleCompanyDelete(ctx, payload);
                break;

            case ROUTING_KEYS.TENANT_CREATED:
            case ROUTING_KEYS.TENANT_UPDATED:
                await this.handleTenantSync(ctx, payload);
                break;

            case ROUTING_KEYS.TENANT_DELETED:
                await this.handleTenantDelete(ctx, payload);
                break;

            case ROUTING_KEYS.CHANNEL_CREATED:
            case ROUTING_KEYS.CHANNEL_UPDATED:
                await this.handleChannelSync(ctx, payload);
                break;

            case ROUTING_KEYS.CHANNEL_DELETED:
                await this.handleChannelDelete(ctx, payload);
                break;

            case ROUTING_KEYS.ADMIN_CREATED:
            case ROUTING_KEYS.ADMIN_UPDATED:
                await this.handleAdminSync(ctx, payload);
                break;

            case ROUTING_KEYS.ADMIN_DEACTIVATED:
                await this.handleAdminDeactivate(ctx, payload);
                break;

            case ROUTING_KEYS.SYNC_FULL:
                await this.handleFullSync(ctx, payload);
                break;

            default:
                Logger.warn(`Unknown routing key: ${routingKey}`, 'RabbitMQHandler');
        }
    }

    private async handleCompanySync(ctx: RequestContext, payload: any) {
        const { company } = payload;
        if (!company?.code) throw new Error('company.code is required');

        const input: SyncCompanyInput = {
            code: company.code,
            name: company.name,
            enabled: company.enabled,
            admin: company.admin,
        };
        await this.tenantService.syncCompany(ctx, input);
    }

    private async handleCompanyDelete(ctx: RequestContext, payload: any) {
        if (!payload.company?.code) throw new Error('company.code is required');
        await this.tenantService.disableCompany(ctx, payload.company.code);
    }

    private async handleTenantSync(ctx: RequestContext, payload: any) {
        const { company, tenant } = payload;
        if (!company?.code) throw new Error('company.code is required for tenant sync');
        if (!tenant?.code) throw new Error('tenant.code is required');

        const input: SyncTenantInput = {
            companyCode: company.code,
            code: tenant.code,
            name: tenant.name,
            enabled: tenant.enabled,
            admin: tenant.admin,
        };
        await this.tenantService.syncTenant(ctx, input);
    }

    private async handleTenantDelete(ctx: RequestContext, payload: any) {
        if (!payload.tenant?.code) throw new Error('tenant.code is required');
        await this.tenantService.disableTenant(ctx, payload.tenant.code);
    }

    private async handleChannelSync(ctx: RequestContext, payload: any) {
        const { company, tenant, channel } = payload;
        if (!company?.code) throw new Error('company.code is required');
        if (!tenant?.code) throw new Error('tenant.code is required');
        if (!channel?.erpChannelId) throw new Error('channel.erpChannelId is required');

        const input: SyncChannelInput = {
            companyCode: company.code,
            tenantCode: tenant.code,
            erpChannelId: channel.erpChannelId,
            code: channel.code,
            name: channel.name,
            defaultCurrencyCode: channel.defaultCurrencyCode,
            defaultLanguageCode: channel.defaultLanguageCode,
            pricesIncludeTax: channel.pricesIncludeTax,
        };
        await this.tenantService.syncChannel(ctx, input);
    }

    private async handleChannelDelete(ctx: RequestContext, payload: any) {
        if (!payload.channel?.erpChannelId) throw new Error('channel.erpChannelId is required');
        await this.tenantService.deleteChannel(ctx, payload.channel.erpChannelId);
    }

    private async handleAdminSync(ctx: RequestContext, payload: any) {
        const { company, tenant, admin } = payload;
        if (!admin?.email) throw new Error('admin.email is required');

        const input: SyncAdminInput = {
            companyCode: company?.code,
            tenantCode: tenant?.code,
            email: admin.email,
            password: admin.password,
            firstName: admin.firstName,
            lastName: admin.lastName,
            role: admin.role || 'tenant-admin',
            channelCodes: admin.channelCodes,
        };
        await this.tenantService.syncAdmin(ctx, input);
    }

    private async handleAdminDeactivate(ctx: RequestContext, payload: any) {
        if (!payload.admin?.email) throw new Error('admin.email is required');
        await this.tenantService.deactivateAdmin(ctx, payload.admin.email);
    }

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

        Logger.info('Full sync completed', 'RabbitMQHandler');
    }
}
