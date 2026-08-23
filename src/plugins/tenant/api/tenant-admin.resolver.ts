import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';
import { TenantService } from '../services/tenant.service';
import '../types';

@Resolver()
export class TenantAdminResolver {
    constructor(private tenantService: TenantService) {}

    @Query()
    @Allow(Permission.SuperAdmin)
    async tenants(@Ctx() ctx: RequestContext) {
        return this.tenantService.findAll(ctx);
    }

    @Query()
    @Allow(Permission.SuperAdmin)
    async tenant(@Ctx() ctx: RequestContext, @Args() args: { id: string }) {
        return this.tenantService.findOne(ctx, args.id);
    }

    @Query()
    @Allow(Permission.SuperAdmin)
    async companies(@Ctx() ctx: RequestContext) {
        return this.tenantService.findAllCompanies(ctx);
    }

    @Query()
    @Allow(Permission.SuperAdmin)
    async company(@Ctx() ctx: RequestContext, @Args() args: { id: string }) {
        return this.tenantService.findCompany(ctx, args.id);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    @Transaction()
    async createTenant(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        return this.tenantService.create(ctx, input);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    @Transaction()
    async createCompany(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        return this.tenantService.syncCompany(ctx, {
            code: input.code,
            name: input.name,
            admin: input.adminEmail ? { email: input.adminEmail, password: input.adminPassword } : undefined,
        });
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    @Transaction()
    async updateCompany(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        return this.tenantService.updateCompany(ctx, input);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    @Transaction()
    async createTenantChannel(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        // Self-service channel creation remains unchanged
        const admin = await this.tenantService['administratorService'].findOneByUserId(ctx, ctx.activeUserId!);
        if (!admin) throw new Error('Forbidden');
        const tenant = admin.customFields.tenant;
        if (!tenant) throw new Error('Forbidden');

        return this.tenantService.syncChannel(ctx, {
            companyCode: '', // will be resolved from tenant
            tenantCode: tenant.code,
            erpChannelId: `self-${Date.now().toString(36)}`,
            code: input.code,
            defaultCurrencyCode: input.defaultCurrencyCode,
            defaultLanguageCode: input.defaultLanguageCode,
        });
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    @Transaction()
    async syncChannelFromErp(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        return this.tenantService.syncChannel(ctx, {
            companyCode: input.companyCode,
            tenantCode: input.tenantCode,
            erpChannelId: input.erpChannelId,
            code: input.channelCode,
            defaultCurrencyCode: input.defaultCurrencyCode,
            defaultLanguageCode: input.defaultLanguageCode,
        });
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    @Transaction()
    async updateTenant(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        return this.tenantService.update(ctx, input);
    }
}
