import { Injectable } from '@nestjs/common';
import {
    TransactionalConnection,
    RequestContext,
    ID,
    ChannelService,
    RoleService,
    AdministratorService,
    UserInputError,
    LanguageCode,
    CurrencyCode,
    Channel,
    Seller,
    Administrator,
    Logger,
    Role,
} from '@vendure/core';
import { Tenant } from '../entities/tenant.entity';
import { Company } from '../entities/company.entity';
import { TENANT_ADMIN_PERMISSIONS } from '../constants';
import {
    SyncCompanyInput,
    SyncTenantInput,
    SyncChannelInput,
    SyncAdminInput,
    CreateTenantInput,
    UpdateTenantInput,
    UpdateCompanyInput,
} from '../types';

@Injectable()
export class TenantService {
    constructor(
        private connection: TransactionalConnection,
        private channelService: ChannelService,
        private roleService: RoleService,
        private administratorService: AdministratorService,
    ) {}

    // ========================================================================
    // COMPANY
    // ========================================================================

    async findAllCompanies(ctx: RequestContext) {
        const repo = this.connection.rawConnection.getRepository(Company);
        const [items, totalItems] = await repo.findAndCount({ relations: { tenants: true } });
        for (const company of items) {
            (company as any).channels = await this.getChannelsForCompany(company.id);
            (company as any).administrators = await this.getAdminsForRole(ctx, company.parentRoleId);
        }
        return { items, totalItems };
    }

    async findCompany(ctx: RequestContext, id: ID) {
        const company = await this.connection.rawConnection.getRepository(Company).findOne({
            where: { id },
            relations: { parentRole: true, tenants: true },
        });
        if (company) {
            (company as any).channels = await this.getChannelsForCompany(company.id);
            (company as any).administrators = await this.getAdminsForRole(ctx, company.parentRoleId);
        }
        return company;
    }

    async findCompanyByCode(ctx: RequestContext, code: string) {
        return this.connection.rawConnection.getRepository(Company).findOne({
            where: { code },
            relations: { tenants: true },
        });
    }

    async syncCompany(ctx: RequestContext, input: SyncCompanyInput): Promise<Company> {
        let company = await this.findCompanyByCode(ctx, input.code);

        if (!company) {
            const role = await this.roleService.create(ctx, {
                code: `company-${input.code}-admin`,
                description: `Company admin for ${input.name || input.code}`,
                permissions: TENANT_ADMIN_PERMISSIONS,
                channelIds: [],
            });

            company = await this.connection.rawConnection.getRepository(Company).save(
                new Company({
                    code: input.code,
                    name: input.name || input.code,
                    enabled: input.enabled !== false,
                    parentRoleId: role.id,
                }),
            );
            Logger.info(`Created company: ${input.code}`, 'TenantService');

            if (input.admin?.email) {
                await this.administratorService.create(ctx, {
                    firstName: input.admin.firstName || input.name || input.code,
                    lastName: input.admin.lastName || 'Admin',
                    emailAddress: input.admin.email,
                    password: input.admin.password || 'changeme123',
                    roleIds: [role.id as string],
                });
                Logger.info(`Created company admin: ${input.admin.email}`, 'TenantService');
            }
        } else {
            let changed = false;
            if (input.name !== undefined && input.name !== company.name) { company.name = input.name; changed = true; }
            if (input.enabled !== undefined && input.enabled !== company.enabled) { company.enabled = input.enabled; changed = true; }
            if (changed) {
                await this.connection.rawConnection.getRepository(Company).save(company);
            }
        }

        return company;
    }

    async updateCompany(ctx: RequestContext, input: UpdateCompanyInput): Promise<Company> {
        const company = await this.findCompany(ctx, input.id);
        if (!company) throw new UserInputError(`Company "${input.id}" not found`);
        if (input.name !== undefined) company.name = input.name;
        if (input.enabled !== undefined) company.enabled = input.enabled;
        return this.connection.rawConnection.getRepository(Company).save(company);
    }

    async disableCompany(ctx: RequestContext, code: string) {
        const company = await this.findCompanyByCode(ctx, code);
        if (company) {
            company.enabled = false;
            await this.connection.rawConnection.getRepository(Company).save(company);
        }
    }

    // ========================================================================
    // TENANT
    // ========================================================================

    async findAll(ctx: RequestContext) {
        const repo = this.connection.getRepository(ctx, Tenant);
        const [items, totalItems] = await repo.findAndCount({ relations: { company: true } });
        for (const tenant of items) {
            (tenant as any).channels = await this.getChannelsForTenant(tenant.id);
            (tenant as any).administrators = await this.getAdminsForTenant(tenant.id);
        }
        return { items, totalItems };
    }

    async findOne(ctx: RequestContext, id: ID) {
        const tenant = await this.connection.getRepository(ctx, Tenant).findOne({
            where: { id },
            relations: { parentRole: true, company: true },
        });
        if (tenant) {
            (tenant as any).channels = await this.getChannelsForTenant(tenant.id);
            (tenant as any).administrators = await this.getAdminsForTenant(tenant.id);
        }
        return tenant;
    }

    async findByCode(ctx: RequestContext, code: string) {
        return this.connection.getRepository(ctx, Tenant).findOne({
            where: { code },
            relations: { company: true },
        });
    }

    async syncTenant(ctx: RequestContext, input: SyncTenantInput): Promise<Tenant> {
        const company = await this.findCompanyByCode(ctx, input.companyCode);
        if (!company) throw new UserInputError(`Company "${input.companyCode}" not found`);

        let tenant = await this.findByCode(ctx, input.code);

        if (!tenant) {
            const role = await this.roleService.create(ctx, {
                code: `tenant-${input.code}-admin`,
                description: `Tenant admin for ${input.name || input.code}`,
                permissions: TENANT_ADMIN_PERMISSIONS,
                channelIds: [],
            });

            tenant = await this.connection.getRepository(ctx, Tenant).save(
                new Tenant({
                    code: input.code,
                    name: input.name || input.code,
                    enabled: input.enabled !== false,
                    parentRoleId: role.id,
                    companyId: company.id,
                }),
            );
            Logger.info(`Created tenant: ${input.code} under ${input.companyCode}`, 'TenantService');

            if (input.admin?.email) {
                await this.administratorService.create(ctx, {
                    firstName: input.admin.firstName || input.name || input.code,
                    lastName: input.admin.lastName || 'Admin',
                    emailAddress: input.admin.email,
                    password: input.admin.password || 'changeme123',
                    roleIds: [role.id as string],
                    customFields: { tenant } as any,
                });
                Logger.info(`Created tenant admin: ${input.admin.email}`, 'TenantService');
            }
        } else {
            let changed = false;
            if (input.name !== undefined) { tenant.name = input.name; changed = true; }
            if (input.enabled !== undefined) { tenant.enabled = input.enabled; changed = true; }
            if (!tenant.companyId) { tenant.companyId = company.id; changed = true; }
            if (changed) {
                await this.connection.getRepository(ctx, Tenant).save(tenant);
            }
        }

        return tenant;
    }

    async disableTenant(ctx: RequestContext, code: string) {
        const tenant = await this.findByCode(ctx, code);
        if (tenant) {
            tenant.enabled = false;
            await this.connection.getRepository(ctx, Tenant).save(tenant);
        }
    }

    async update(ctx: RequestContext, input: UpdateTenantInput): Promise<Tenant> {
        const tenant = await this.findOne(ctx, input.id);
        if (!tenant) throw new UserInputError(`Tenant "${input.id}" not found`);
        if (input.name !== undefined) tenant.name = input.name;
        if (input.enabled !== undefined) tenant.enabled = input.enabled;
        if (input.maxChannels !== undefined) tenant.maxChannels = input.maxChannels;
        return this.connection.getRepository(ctx, Tenant).save(tenant);
    }

    // ========================================================================
    // CHANNEL
    // ========================================================================

    async syncChannel(ctx: RequestContext, input: SyncChannelInput): Promise<Channel> {
        // Validate hierarchy
        if (input.companyCode) {
            const company = await this.findCompanyByCode(ctx, input.companyCode);
            if (!company) throw new UserInputError(`Company "${input.companyCode}" not found`);
        }

        const tenant = await this.findByCode(ctx, input.tenantCode);
        if (!tenant) throw new UserInputError(`Tenant "${input.tenantCode}" not found`);

        // Idempotent: check existing by erpChannelId
        const existing = await this.connection.rawConnection
            .getRepository(Channel)
            .findOne({ where: { customFields: { erpChannelId: input.erpChannelId } } as any });

        if (existing) {
            const updatePayload: any = {
                id: existing.id,
                customFields: { tenant, erpChannelId: input.erpChannelId } as any,
            };
            if (input.code) updatePayload.code = input.code;
            if (input.defaultLanguageCode) updatePayload.defaultLanguageCode = input.defaultLanguageCode;
            if (input.defaultCurrencyCode) updatePayload.defaultCurrencyCode = input.defaultCurrencyCode;
            return this.channelService.update(ctx, updatePayload) as Promise<Channel>;
        }

        const channelCode = input.code || `${input.tenantCode}-${Date.now().toString(36)}`;
        const token = `${channelCode}-${Date.now().toString(36)}`;

        const channel = await this.channelService.create(ctx, {
            code: channelCode,
            token,
            defaultLanguageCode: (input.defaultLanguageCode || 'en') as any,
            defaultCurrencyCode: (input.defaultCurrencyCode || 'USD') as any,
            pricesIncludeTax: input.pricesIncludeTax || false,
            defaultShippingZoneId: undefined as any,
            defaultTaxZoneId: undefined as any,
            customFields: { tenant, erpChannelId: input.erpChannelId } as any,
        });

        Logger.info(`Created channel: ${channelCode} (erp: ${input.erpChannelId})`, 'TenantService');

        // Ensure SuperAdmin role sees the new channel in the dashboard
        await this.syncSuperAdminChannels();

        return channel as Channel;
    }

    async deleteChannel(ctx: RequestContext, erpChannelId: string) {
        const channel = await this.connection.rawConnection
            .getRepository(Channel)
            .findOne({ where: { customFields: { erpChannelId } } as any });
        if (channel) {
            await this.channelService.delete(ctx, channel.id);
            Logger.info(`Deleted channel: ${erpChannelId}`, 'TenantService');
        }
    }

    // ========================================================================
    // ADMIN
    // ========================================================================

    async syncAdmin(ctx: RequestContext, input: SyncAdminInput) {
        // Check if exists
        const { items } = await this.administratorService.findAll(ctx, {
            filter: { emailAddress: { eq: input.email } },
        });
        if (items.length > 0) {
            Logger.info(`Admin ${input.email} already exists, skipping`, 'TenantService');
            return;
        }

        let roleIds: string[] = [];
        let tenant: Tenant | null = null;

        if (input.role === 'company-admin' && input.companyCode) {
            const company = await this.findCompanyByCode(ctx, input.companyCode);
            if (company) roleIds = [company.parentRoleId as string];
        } else if (input.role === 'store-staff' && input.channelCodes?.length) {
            // Ensure SuperAdmin role has access to these channels first
            await this.syncSuperAdminChannels();

            const allChannels = await this.channelService.findAll(ctx);
            const channelList = (allChannels as any).items || allChannels;
            const channelIds = channelList
                .filter((c: any) => input.channelCodes!.includes(c.code))
                .map((c: any) => c.id as string);

            if (channelIds.length > 0) {
                const role = await this.roleService.create(ctx, {
                    code: `staff-${input.email.split('@')[0]}-${Date.now().toString(36)}`,
                    description: `Store staff for ${input.email}`,
                    permissions: ['ReadCatalog' as any, 'ReadOrder' as any, 'UpdateOrder' as any, 'ReadCustomer' as any],
                    channelIds,
                });
                roleIds = [role.id as string];
            }
        } else if (input.tenantCode) {
            tenant = await this.findByCode(ctx, input.tenantCode);
            if (tenant) roleIds = [tenant.parentRoleId as string];
        }

        if (roleIds.length === 0) {
            Logger.warn(`No role for admin ${input.email}`, 'TenantService');
            return;
        }

        await this.administratorService.create(ctx, {
            firstName: input.firstName || 'Admin',
            lastName: input.lastName || '',
            emailAddress: input.email,
            password: input.password || 'changeme123',
            roleIds,
            customFields: tenant ? { tenant } as any : undefined,
        });

        Logger.info(`Created admin: ${input.email} (${input.role || 'tenant-admin'})`, 'TenantService');
    }

    async deactivateAdmin(ctx: RequestContext, email: string) {
        const { items } = await this.administratorService.findAll(ctx, {
            filter: { emailAddress: { eq: email } },
        });
        if (items.length > 0) {
            await this.administratorService.softDelete(ctx, items[0].id);
            Logger.info(`Deactivated admin: ${email}`, 'TenantService');
        }
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

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

    async getChannelsForCompany(companyId: ID): Promise<Channel[]> {
        const tenants = await this.connection.rawConnection
            .getRepository(Tenant)
            .find({ where: { companyId: companyId as any } });
        const channels: Channel[] = [];
        for (const t of tenants) {
            channels.push(...await this.getChannelsForTenant(t.id));
        }
        return channels;
    }

    async getAdminsForRole(ctx: RequestContext, roleId: ID): Promise<Administrator[]> {
        const role = await this.roleService.findOne(ctx, roleId, ['channels']);
        if (!role) return [];
        // Find admins who have this role via AdministratorService
        const { items: allAdmins } = await this.administratorService.findAll(ctx, { take: 1000 });
        // Filter to admins that have this specific role
        const adminsWithRole: Administrator[] = [];
        for (const admin of allAdmins) {
            const adminWithUser = await this.administratorService.findOne(ctx, admin.id, ['user.roles']);
            if (adminWithUser?.user?.roles?.some(r => String(r.id) === String(roleId))) {
                adminsWithRole.push(adminWithUser);
            }
        }
        return adminsWithRole;
    }

    // ========================================================================
    // INTERNAL HELPERS
    // ========================================================================

    /**
     * Ensures the SuperAdmin role has access to all channels.
     * Needed because RoleService.create checks if the caller has access
     * to the target channels, and new channels aren't automatically
     * added to the SuperAdmin role.
     */
    private async syncSuperAdminChannels() {
        const allChannels = await this.connection.rawConnection.getRepository(Channel).find();
        const saRole = await this.connection.rawConnection.getRepository(Role).findOne({
            where: { code: '__super_admin_role__' },
            relations: { channels: true },
        });
        if (!saRole) return;
        const existingIds = new Set(saRole.channels.map(c => Number(c.id)));
        const missing = allChannels.filter(c => !existingIds.has(Number(c.id)));
        if (missing.length > 0) {
            saRole.channels.push(...missing);
            await this.connection.rawConnection.getRepository(Role).save(saRole);
        }
    }

    // ========================================================================
    // LEGACY (used by GraphQL resolver + seed)
    // ========================================================================

    async create(ctx: RequestContext, input: CreateTenantInput): Promise<Tenant> {
        const existing = await this.findByCode(ctx, input.code);
        if (existing) throw new UserInputError(`Tenant "${input.code}" already exists`);

        let companyId: ID | undefined;
        if (input.companyCode) {
            const company = await this.findCompanyByCode(ctx, input.companyCode);
            if (company) companyId = company.id;
        }

        const role = await this.roleService.create(ctx, {
            code: `tenant-${input.code}-admin`,
            description: `Admin role for ${input.name}`,
            permissions: TENANT_ADMIN_PERMISSIONS,
            channelIds: [],
        });

        const tenant = await this.connection.getRepository(ctx, Tenant).save(
            new Tenant({
                code: input.code,
                name: input.name,
                enabled: true,
                parentRoleId: role.id,
                companyId: companyId as any,
            }),
        );

        const channelCode = input.channelCode || input.code;
        const token = `${channelCode}-${Date.now().toString(36)}`;
        await this.channelService.create(ctx, {
            code: channelCode,
            token,
            defaultLanguageCode: (input.defaultLanguageCode || LanguageCode.en) as any,
            defaultCurrencyCode: (input.defaultCurrencyCode || CurrencyCode.USD) as any,
            pricesIncludeTax: false,
            defaultShippingZoneId: undefined as any,
            defaultTaxZoneId: undefined as any,
            customFields: { tenant } as any,
        });

        await this.syncSuperAdminChannels();

        await this.connection.rawConnection.getRepository(Seller).save(
            this.connection.rawConnection.getRepository(Seller).create({ name: input.name }),
        );

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
}
