import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';
import { TenantService } from '../services/tenant.service';

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

    @Mutation()
    @Allow(Permission.SuperAdmin)
    @Transaction()
    async createTenant(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        return this.tenantService.create(ctx, input);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    @Transaction()
    async createTenantChannel(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        return this.tenantService.createTenantChannel(ctx, input);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    @Transaction()
    async syncChannelFromErp(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        return this.tenantService.syncFromErp(ctx, input);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    @Transaction()
    async updateTenant(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        return this.tenantService.update(ctx, input);
    }
}
