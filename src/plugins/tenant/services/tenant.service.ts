import { Injectable } from '@nestjs/common';
import {
    TransactionalConnection,
    RequestContext,
    ID,
    ChannelService,
    RoleService,
    AdministratorService,
    UserInputError,
    ForbiddenError,
    LanguageCode,
    CurrencyCode,
    Channel,
    Seller,
    Administrator,
} from '@vendure/core';
import { CreateRoleInput } from '@vendure/common/lib/generated-types';
import { Tenant } from '../entities/tenant.entity';
import { TENANT_ADMIN_PERMISSIONS } from '../constants';

@Injectable()
export class TenantService {
    constructor(
        private connection: TransactionalConnection,
        private channelService: ChannelService,
        private roleService: RoleService,
        private administratorService: AdministratorService,
    ) {}

    async findAll(ctx: RequestContext): Promise<{ items: Tenant[]; totalItems: number }> {
        const repo = this.connection.getRepository(ctx, Tenant);
        const [items, totalItems] = await repo.findAndCount();
        // Attach channels and admins to each tenant
        for (const tenant of items) {
            (tenant as any).channels = await this.getChannelsForTenant(tenant.id);
            (tenant as any).administrators = await this.getAdminsForTenant(tenant.id);
        }
        return { items, totalItems };
    }

    async findOne(ctx: RequestContext, id: ID): Promise<Tenant | null> {
        const tenant = await this.connection.getRepository(ctx, Tenant).findOne({
            where: { id },
            relations: { parentRole: true },
        });
        if (tenant) {
            (tenant as any).channels = await this.getChannelsForTenant(tenant.id);
            (tenant as any).administrators = await this.getAdminsForTenant(tenant.id);
        }
        return tenant;
    }

    async getChannelsForTenant(tenantId: ID): Promise<Channel[]> {
        return this.connection.rawConnection
            .getRepository(Channel)
            .find({ where: { customFields: { tenant: { id: tenantId } } } as any });
    }

    async getAdminsForTenant(tenantId: ID): Promise<Administrator[]> {
        return this.connection.rawConnection
            .getRepository(Administrator)
            .find({ where: { customFields: { tenant: { id: tenantId } } } as any });
    }

    async findByCode(ctx: RequestContext, code: string): Promise<Tenant | null> {
        return this.connection.getRepository(ctx, Tenant).findOne({
            where: { code },
        });
    }

    async create(
        ctx: RequestContext,
        input: {
            code: string;
            name: string;
            adminEmail: string;
            adminPassword: string;
            channelCode?: string;
            defaultCurrencyCode?: CurrencyCode;
            defaultLanguageCode?: LanguageCode;
        },
    ): Promise<Tenant> {
        const existing = await this.findByCode(ctx, input.code);
        if (existing) {
            throw new UserInputError(`A tenant with code "${input.code}" already exists`);
        }

        // 1. Create a Role with tenant permissions (no channels yet)
        const roleInput: CreateRoleInput = {
            code: `tenant-${input.code}-admin`,
            description: `Admin role for tenant ${input.name}`,
            permissions: TENANT_ADMIN_PERMISSIONS,
            channelIds: [],
        };
        const role = await this.roleService.create(ctx, roleInput);

        // 2. Create the Tenant entity pointing at that role
        const tenant = await this.connection.getRepository(ctx, Tenant).save(
            new Tenant({
                code: input.code,
                name: input.name,
                enabled: true,
                parentRoleId: role.id,
            }),
        );

        // 3. Create a Channel for this tenant
        const channelCode = input.channelCode || input.code;
        const token = `${channelCode}-${Date.now().toString(36)}`;
        const channel = await this.channelService.create(ctx, {
            code: channelCode,
            token,
            defaultLanguageCode: input.defaultLanguageCode || LanguageCode.en,
            defaultCurrencyCode: input.defaultCurrencyCode || CurrencyCode.USD,
            pricesIncludeTax: false,
            defaultShippingZoneId: undefined as any,
            defaultTaxZoneId: undefined as any,
            customFields: { tenant } as any,
        });

        // 4. Create a Seller for the channel
        const sellerRepo = this.connection.rawConnection.getRepository(Seller);
        const seller = sellerRepo.create({ name: input.name });
        await sellerRepo.save(seller);

        // 5. Create an Administrator with the role and tenant
        await this.administratorService.create(ctx, {
            firstName: input.name,
            lastName: 'Admin',
            emailAddress: input.adminEmail,
            password: input.adminPassword,
            roleIds: [role.id as string],
            customFields: { tenant } as any,
        });

        return tenant;
    }

    async provisionTenant(
        ctx: RequestContext,
        input: { code: string; name: string },
    ): Promise<Tenant> {
        const existing = await this.findByCode(ctx, input.code);
        if (existing) {
            return existing;
        }

        // Role + Tenant only, no channel
        const roleInput: CreateRoleInput = {
            code: `tenant-${input.code}-admin`,
            description: `Admin role for tenant ${input.name}`,
            permissions: TENANT_ADMIN_PERMISSIONS,
            channelIds: [],
        };
        const role = await this.roleService.create(ctx, roleInput);

        const tenant = await this.connection.getRepository(ctx, Tenant).save(
            new Tenant({
                code: input.code,
                name: input.name,
                enabled: true,
                parentRoleId: role.id,
            }),
        );

        return tenant;
    }

    async createTenantChannel(
        ctx: RequestContext,
        input: {
            code: string;
            token: string;
            defaultCurrencyCode?: CurrencyCode;
            defaultLanguageCode?: LanguageCode;
        },
    ): Promise<Channel> {
        // Find the calling admin's tenant
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId!);
        if (!admin) {
            throw new ForbiddenError();
        }
        const tenant = (admin.customFields as any)?.tenant as Tenant | null;
        if (!tenant) {
            throw new ForbiddenError();
        }

        // Load tenant to check maxChannels
        const fullTenant = await this.findOne(ctx, tenant.id);
        if (!fullTenant || !fullTenant.enabled) {
            throw new ForbiddenError();
        }

        // Count existing channels for this tenant
        const existingChannels = await this.connection.rawConnection
            .getRepository(Channel)
            .count({ where: { customFields: { tenant: { id: fullTenant.id } } } as any });

        if (existingChannels >= fullTenant.maxChannels) {
            throw new UserInputError(
                `Tenant "${fullTenant.name}" has reached the maximum number of channels (${fullTenant.maxChannels})`,
            );
        }

        // Create channel stamped with caller's tenant
        const channel = await this.channelService.create(ctx, {
            code: input.code,
            token: input.token,
            defaultLanguageCode: input.defaultLanguageCode || LanguageCode.en,
            defaultCurrencyCode: input.defaultCurrencyCode || CurrencyCode.USD,
            pricesIncludeTax: false,
            defaultShippingZoneId: undefined as any,
            defaultTaxZoneId: undefined as any,
            customFields: { tenant: fullTenant } as any,
        });

        return channel as Channel;
    }

    async syncFromErp(
        ctx: RequestContext,
        input: {
            erpChannelId: string;
            tenantCode: string;
            tenantName?: string;
            channelCode: string;
            channelToken: string;
            defaultCurrencyCode?: CurrencyCode;
            defaultLanguageCode?: LanguageCode;
        },
    ): Promise<Channel> {
        // Find or auto-create tenant
        let tenant = await this.findByCode(ctx, input.tenantCode);
        if (!tenant) {
            tenant = await this.provisionTenant(ctx, {
                code: input.tenantCode,
                name: input.tenantName || input.tenantCode,
            });
        }

        // Check for existing channel by erpChannelId (idempotent)
        const existingChannel = await this.connection.rawConnection
            .getRepository(Channel)
            .findOne({
                where: { customFields: { erpChannelId: input.erpChannelId } } as any,
            });

        if (existingChannel) {
            // Update existing channel
            return this.channelService.update(ctx, {
                id: existingChannel.id,
                code: input.channelCode,
                token: input.channelToken,
                defaultLanguageCode: input.defaultLanguageCode || existingChannel.defaultLanguageCode,
                defaultCurrencyCode: input.defaultCurrencyCode || existingChannel.defaultCurrencyCode,
                customFields: {
                    tenant,
                    erpChannelId: input.erpChannelId,
                } as any,
            }) as Promise<Channel>;
        }

        // Create new channel stamped with tenant and erpChannelId
        const channel = await this.channelService.create(ctx, {
            code: input.channelCode,
            token: input.channelToken,
            defaultLanguageCode: input.defaultLanguageCode || LanguageCode.en,
            defaultCurrencyCode: input.defaultCurrencyCode || CurrencyCode.USD,
            pricesIncludeTax: false,
            defaultShippingZoneId: undefined as any,
            defaultTaxZoneId: undefined as any,
            customFields: {
                tenant,
                erpChannelId: input.erpChannelId,
            } as any,
        });

        return channel as Channel;
    }

    async update(
        ctx: RequestContext,
        input: { id: ID; name?: string; enabled?: boolean; maxChannels?: number },
    ): Promise<Tenant> {
        const tenant = await this.findOne(ctx, input.id);
        if (!tenant) {
            throw new UserInputError(`Tenant with id "${input.id}" not found`);
        }

        if (input.name !== undefined) {
            tenant.name = input.name;
        }
        if (input.enabled !== undefined) {
            tenant.enabled = input.enabled;
        }
        if (input.maxChannels !== undefined) {
            tenant.maxChannels = input.maxChannels;
        }

        return this.connection.getRepository(ctx, Tenant).save(tenant);
    }
}
