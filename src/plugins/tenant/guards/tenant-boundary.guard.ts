import { Injectable } from '@nestjs/common';
import {
    TransactionalConnection,
    AdministratorService,
    RequestContext,
    ID,
    ForbiddenError,
    Channel,
} from '@vendure/core';
import { Tenant } from '../entities/tenant.entity';

@Injectable()
export class TenantBoundaryGuard {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
    ) {}

    async assertSameTenant(ctx: RequestContext, channelIds: ID[]): Promise<void> {
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId!);
        if (!admin) {
            throw new ForbiddenError();
        }

        const adminTenant = (admin.customFields as any)?.tenant as Tenant | null;
        if (!adminTenant) {
            // SuperAdmin with no tenant — allow everything
            return;
        }

        for (const channelId of channelIds) {
            const channel = await this.connection.rawConnection
                .getRepository(Channel)
                .findOne({ where: { id: channelId } });

            const channelTenantId =
                (channel as any)?.customFields?.tenant?.id ??
                (channel as any)?.customFieldsTenantId;

            if (!channelTenantId || String(channelTenantId) !== String(adminTenant.id)) {
                throw new ForbiddenError();
            }
        }
    }

    async assertTenantEnabled(ctx: RequestContext): Promise<void> {
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId!);
        if (!admin) {
            throw new ForbiddenError();
        }

        const adminTenant = (admin.customFields as any)?.tenant as Tenant | null;
        if (!adminTenant) {
            // SuperAdmin — always allowed
            return;
        }

        const tenant = await this.connection.rawConnection
            .getRepository(Tenant)
            .findOne({ where: { id: adminTenant.id } });

        if (!tenant || !tenant.enabled) {
            throw new ForbiddenError();
        }
    }
}
