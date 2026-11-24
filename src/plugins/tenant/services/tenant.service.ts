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
    isGraphQlErrorResult,
    StockLocationService,
    GlobalSettingsService,
    ExternalAuthenticationService,
    SessionService,
    Permission,
} from '@vendure/core';
import { Tenant } from '../entities/tenant.entity';
import { Company } from '../entities/company.entity';
import { ERP_MANAGED_PERMISSIONS, TENANT_ADMIN_PERMISSIONS } from '../constants';
import { ZITADEL_STRATEGY_NAME } from '../../zitadel/constants';
import { ensureChannelStockLocation } from './channel-stock-location';
import {
    SyncCompanyInput,
    SyncTenantInput,
    SyncChannelInput,
    SyncAdminInput,
    CreateTenantInput,
    UpdateTenantInput,
    UpdateCompanyInput,
    CompanyWithRelations,
    TenantWithRelations,
} from '../types';
import '../types';
import type { UpdateChannelInput } from '@vendure/common/lib/generated-types';

@Injectable()
export class TenantService {
    constructor(
        private connection: TransactionalConnection,
        private channelService: ChannelService,
        private roleService: RoleService,
        private administratorService: AdministratorService,
        private stockLocationService: StockLocationService,
        private globalSettingsService: GlobalSettingsService,
        private externalAuthenticationService: ExternalAuthenticationService,
        private sessionService: SessionService,
    ) {}

    // ========================================================================
    // COMPANY
    // ========================================================================

    async findAllCompanies(ctx: RequestContext) {
        const companies = await this.connection.rawConnection.getRepository(Company).find({ relations: { tenants: true } });
        const readableCompanies = await Promise.all(companies.map(company => this.readableCompany(ctx, company)));
        const items = readableCompanies.filter((company): company is CompanyWithRelations => company !== null);
        return { items, totalItems: items.length };
    }

    async findCompany(ctx: RequestContext, id: ID): Promise<CompanyWithRelations | null> {
        const company = await this.connection.rawConnection.getRepository(Company).findOne({
            where: { id },
            relations: { parentRole: true, tenants: true },
        });
        return company ? this.readableCompany(ctx, company) : null;
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
        } else {
            await this.revokeErpManagedPermissions(ctx, company.parentRoleId);
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
        const tenants = await this.connection.getRepository(ctx, Tenant).find({ relations: { company: true } });
        const readableTenants = await Promise.all(tenants.map(tenant => this.readableTenant(ctx, tenant)));
        const items = readableTenants.filter((tenant): tenant is TenantWithRelations => tenant !== null);
        return { items, totalItems: items.length };
    }

    async findOne(ctx: RequestContext, id: ID): Promise<TenantWithRelations | null> {
        const tenant = await this.connection.getRepository(ctx, Tenant).findOne({
            where: { id },
            relations: { parentRole: true, company: true },
        });
        return tenant ? this.readableTenant(ctx, tenant) : null;
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
        } else {
            await this.revokeErpManagedPermissions(ctx, tenant.parentRoleId);
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

    /**
     * Roles created before a permission became ERP-managed still hold it. Removes only those
     * permissions, keeping anything else an admin granted, and writes only when one is present.
     */
    private async revokeErpManagedPermissions(ctx: RequestContext, roleId: ID) {
        const role = await this.roleService.findOne(ctx, roleId);
        if (!role || !role.permissions.some(permission => ERP_MANAGED_PERMISSIONS.includes(permission))) {
            return;
        }
        await this.roleService.update(ctx, {
            id: role.id,
            permissions: role.permissions.filter(permission => !ERP_MANAGED_PERMISSIONS.includes(permission)),
        });
        Logger.info(`Revoked ERP-managed permissions from role ${role.code}`, 'TenantService');
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
        // TypeORM cannot type custom field relations in where clauses
        const existing = await this.connection.rawConnection
            .getRepository(Channel)
            .findOne({ where: { customFields: { erpChannelId: input.erpChannelId } } as any });

        if (existing) {
            const updatePayload: UpdateChannelInput = {
                id: existing.id,
                customFields: { tenant, erpChannelId: input.erpChannelId },
            };
            if (input.code) updatePayload.code = input.code;
            if (input.defaultLanguageCode || input.availableLanguageCodes) {
                const languages = await this.enableStoreLanguages(ctx, input.defaultLanguageCode, input.availableLanguageCodes);
                updatePayload.defaultLanguageCode = languages.defaultLanguageCode;
                updatePayload.availableLanguageCodes = languages.availableLanguageCodes;
            }
            if (input.defaultCurrencyCode) updatePayload.defaultCurrencyCode = this.toCurrencyCode(input.defaultCurrencyCode);
            const updated = await this.channelService.update(ctx, updatePayload);
            if (isGraphQlErrorResult(updated)) {
                throw new UserInputError(updated.message);
            }
            // Also gives channels created before stock locations were set up their own.
            await ensureChannelStockLocation(this.connection, this.stockLocationService, ctx, updated);
            return updated;
        }

        const channelCode = input.code || `${input.tenantCode}-${Date.now().toString(36)}`;
        const token = `${channelCode}-${Date.now().toString(36)}`;

        // Copy default tax/shipping zones from the default channel
        const defaultChannel = await this.channelService.getDefaultChannel(ctx);
        const defaultChannelFull = await this.connection.rawConnection
            .getRepository(Channel)
            .findOne({ where: { id: defaultChannel.id }, relations: { defaultTaxZone: true, defaultShippingZone: true } });

        const languages = await this.enableStoreLanguages(ctx, input.defaultLanguageCode, input.availableLanguageCodes);
        const result = await this.channelService.create(ctx, {
            code: channelCode,
            token,
            defaultLanguageCode: languages.defaultLanguageCode,
            availableLanguageCodes: languages.availableLanguageCodes,
            defaultCurrencyCode: this.toCurrencyCode(input.defaultCurrencyCode || CurrencyCode.USD),
            pricesIncludeTax: input.pricesIncludeTax || false,
            defaultShippingZoneId: defaultChannelFull?.defaultShippingZone?.id ?? undefined!,
            defaultTaxZoneId: defaultChannelFull?.defaultTaxZone?.id ?? undefined!,
            customFields: { tenant, erpChannelId: input.erpChannelId },
        });

        if (isGraphQlErrorResult(result)) {
            throw new UserInputError(result.message);
        }

        Logger.info(`Created channel: ${channelCode} (erp: ${input.erpChannelId})`, 'TenantService');

        // result is now typed as Channel
        await this.assignBuiltInRolesToChannel(ctx, result.id);
        await ensureChannelStockLocation(this.connection, this.stockLocationService, ctx, result);

        // Assign channel to tenant's parent role
        await this.roleService.assignRoleToChannel(ctx, tenant.parentRoleId, result.id);
        Logger.info(`Assigned channel to tenant role (tenant: ${tenant.code})`, 'TenantService');

        // Assign channel to company's parent role (if tenant has a company)
        if (tenant.companyId) {
            const company = await this.connection.rawConnection
                .getRepository(Company)
                .findOne({ where: { id: tenant.companyId } });
            if (company) {
                await this.roleService.assignRoleToChannel(ctx, company.parentRoleId, result.id);
                Logger.info(`Assigned channel to company role (company: ${company.code})`, 'TenantService');
            }
        }

        return result;
    }

    private toCurrencyCode(requestedCode: string): CurrencyCode {
        const currencyCode = Object.values(CurrencyCode).find((code) => code === requestedCode);
        if (!currencyCode) throw new UserInputError(`"${requestedCode}" is not a Vendure currency code`);
        return currencyCode;
    }

    // A store's languages, store language first. Vendure lets a channel use only languages that are
    // switched on platform-wide (Settings › Global settings), so any that are not yet are added there.
    private async enableStoreLanguages(
        ctx: RequestContext,
        defaultLanguageCode: string | undefined,
        availableLanguageCodes: string[] | undefined,
    ): Promise<{ defaultLanguageCode: LanguageCode; availableLanguageCodes: LanguageCode[] }> {
        const requestedCodes = [...new Set([defaultLanguageCode || LanguageCode.en, ...(availableLanguageCodes ?? [])])];
        const languageCodes = requestedCodes.map((requestedCode) => {
            const languageCode = Object.values(LanguageCode).find((code) => code === requestedCode);
            if (!languageCode) throw new UserInputError(`"${requestedCode}" is not a Vendure language code`);
            return languageCode;
        });
        const settings = await this.globalSettingsService.getSettings(ctx);
        const missingCodes = languageCodes.filter((code) => !settings.availableLanguages.includes(code));
        if (missingCodes.length > 0) {
            await this.globalSettingsService.updateSettings(ctx, {
                availableLanguages: [...settings.availableLanguages, ...missingCodes],
            });
            Logger.info(`Switched on languages for a store: ${missingCodes.join(', ')}`, 'TenantService');
        }
        return { defaultLanguageCode: languageCodes[0], availableLanguageCodes: languageCodes };
    }

    async deleteChannel(ctx: RequestContext, erpChannelId: string) {
        // TypeORM cannot type custom field relations in where clauses
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

    /**
     * Creates and updates the person's Vendure admin, linked to their ZITADEL account (wisko-auth docs/vendureAuth.md
     * B4). Roles come only from ZITADEL (src/plugins/zitadel), so none are given here.
     */
    async syncAdmin(ctx: RequestContext, input: SyncAdminInput) {
        if (!input.zitadelUserId) {
            Logger.info(`Skipped admin ${input.email}: no ZITADEL account yet`, 'TenantService');
            return;
        }
        const user = await this.externalAuthenticationService.findAdministratorUser(ctx, ZITADEL_STRATEGY_NAME, input.zitadelUserId);
        const existing = user ? await this.administratorService.findOneByUserId(ctx, user.id) : undefined;
        if (existing) {
            await this.administratorService.update(ctx, {
                id: existing.id,
                firstName: input.firstName,
                lastName: input.lastName,
                emailAddress: input.email === existing.emailAddress ? undefined : input.email,
            });
            Logger.info(`Updated admin ${input.email}`, 'TenantService');
            return;
        }

        const createdUser = await this.externalAuthenticationService.createAdministratorAndUser(ctx, {
            strategy: ZITADEL_STRATEGY_NAME,
            externalIdentifier: input.zitadelUserId,
            identifier: input.email,
            emailAddress: input.email,
            firstName: input.firstName || input.email,
            lastName: input.lastName || '',
            roles: [],
        });
        const tenant = input.role === 'tenant-admin' && input.tenantCode ? await this.findByCode(ctx, input.tenantCode) : null;
        const administrator = await this.administratorService.findOneByUserId(ctx, createdUser.id);
        if (tenant && administrator) {
            await this.administratorService.update(ctx, { id: administrator.id, customFields: { tenant } });
        }
        Logger.info(`Created admin: ${input.email} (ZITADEL ${input.zitadelUserId})`, 'TenantService');
    }

    /** With passwords off, ZITADEL is the only way in: ending the sessions is enough (no soft delete). */
    async deactivateAdmin(ctx: RequestContext, email: string) {
        const { items } = await this.administratorService.findAll(ctx, {
            filter: { emailAddress: { eq: email } },
        }, ['user']);
        for (const administrator of items) {
            await this.sessionService.deleteSessionsByUser(ctx, administrator.user);
            Logger.info(`Signed out deactivated admin: ${email}`, 'TenantService');
        }
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    async getChannelsForTenant(tenantId: ID): Promise<any[]> {
        // TypeORM cannot type custom field relations in where clauses
        const channels = await this.connection.rawConnection
            .getRepository(Channel)
            .find({ where: { customFields: { tenant: { id: tenantId } } } as any });
        // Flatten erpChannelId from customFields to top level for GraphQL
        return channels.map(ch => ({
            ...ch,
            erpChannelId: ch.customFields?.erpChannelId || null,
        }));
    }

    async getAdminsForTenant(tenantId: ID): Promise<Administrator[]> {
        // TypeORM cannot type custom field relations in where clauses
        return this.connection.rawConnection
            .getRepository(Administrator)
            .find({ where: { customFields: { tenant: { id: tenantId } } } as any });
    }

    async getChannelsForCompany(companyId: ID): Promise<Channel[]> {
        const tenants = await this.connection.rawConnection
            .getRepository(Tenant)
            .find({ where: { companyId: String(companyId) } });
        const channels: Channel[] = [];
        for (const t of tenants) {
            channels.push(...await this.getChannelsForTenant(t.id));
        }
        return channels;
    }

    /** A SuperAdmin sees everything; anyone else only the stores their role lets them view, and the companies and organizations above them. */
    private async readableCompany(ctx: RequestContext, company: Company): Promise<CompanyWithRelations | null> {
        const tenants = await Promise.all((company.tenants ?? []).map(tenant => this.readableTenant(ctx, tenant)));
        const readableTenants = tenants.filter((tenant): tenant is TenantWithRelations => tenant !== null);
        if (readableTenants.length === 0 && !this.canReadEveryStore(ctx)) return null;
        return Object.assign(company, {
            tenants: readableTenants,
            channels: readableTenants.flatMap(tenant => tenant.channels),
        });
    }

    private async readableTenant(ctx: RequestContext, tenant: Tenant): Promise<TenantWithRelations | null> {
        const canReadEveryStore = this.canReadEveryStore(ctx);
        const tenantChannels = await this.getChannelsForTenant(tenant.id);
        const channels = canReadEveryStore
            ? tenantChannels
            : tenantChannels.filter(channel => ctx.userHasPermissions([Permission.ReadChannel], channel.id));
        if (channels.length === 0 && !canReadEveryStore) return null;
        const administrators = await this.getAdminsForTenant(tenant.id);
        return Object.assign(tenant, { channels, administrators });
    }

    private canReadEveryStore(ctx: RequestContext): boolean {
        return ctx.userHasPermissions([Permission.SuperAdmin]);
    }

    // ========================================================================
    // INTERNAL HELPERS
    // ========================================================================

    /**
     * Assigns SuperAdmin + Customer roles to a new channel.
     * This is what Vendure's createChannel GraphQL resolver does internally,
     * but we bypass the resolver when calling channelService.create() directly.
     */
    private async assignBuiltInRolesToChannel(ctx: RequestContext, channelId: ID) {
        const superAdminRole = await this.roleService.getSuperAdminRole(ctx);
        const customerRole = await this.roleService.getCustomerRole(ctx);
        await this.roleService.assignRoleToChannel(ctx, superAdminRole.id, channelId);
        await this.roleService.assignRoleToChannel(ctx, customerRole.id, channelId);
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
                companyId: companyId as ID,
            }),
        );

        const channelCode = input.channelCode || input.code;
        const token = `${channelCode}-${Date.now().toString(36)}`;

        const defChannel = await this.channelService.getDefaultChannel(ctx);
        const defChannelFull = await this.connection.rawConnection
            .getRepository(Channel)
            .findOne({ where: { id: defChannel.id }, relations: { defaultTaxZone: true, defaultShippingZone: true } });

        const newChannel = await this.channelService.create(ctx, {
            code: channelCode,
            token,
            defaultLanguageCode: (input.defaultLanguageCode || LanguageCode.en) as LanguageCode,
            defaultCurrencyCode: (input.defaultCurrencyCode || CurrencyCode.USD) as CurrencyCode,
            pricesIncludeTax: false,
            defaultShippingZoneId: defChannelFull?.defaultShippingZone?.id ?? undefined!,
            defaultTaxZoneId: defChannelFull?.defaultTaxZone?.id ?? undefined!,
            // customFields is typed as JSON in CreateChannelInput
            customFields: { tenant } as any,
        });

        if (isGraphQlErrorResult(newChannel)) {
            throw new UserInputError(newChannel.message);
        }

        await this.assignBuiltInRolesToChannel(ctx, newChannel.id);
        await ensureChannelStockLocation(this.connection, this.stockLocationService, ctx, newChannel);

        // Assign to tenant + company roles
        await this.roleService.assignRoleToChannel(ctx, tenant.parentRoleId, newChannel.id);
        if (tenant.companyId) {
            const company = await this.connection.rawConnection.getRepository(Company)
                .findOne({ where: { id: tenant.companyId } });
            if (company) {
                await this.roleService.assignRoleToChannel(ctx, company.parentRoleId, newChannel.id);
            }
        }

        await this.connection.rawConnection.getRepository(Seller).save(
            this.connection.rawConnection.getRepository(Seller).create({ name: input.name }),
        );

        await this.administratorService.create(ctx, {
            firstName: input.name,
            lastName: 'Admin',
            emailAddress: input.adminEmail,
            password: input.adminPassword,
            roleIds: [role.id as string],
            // customFields is typed as JSON in CreateAdministratorInput
            customFields: { tenant } as any,
        });

        return tenant;
    }
}
