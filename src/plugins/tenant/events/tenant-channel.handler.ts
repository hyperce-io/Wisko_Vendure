import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    ChannelEvent,
    RoleService,
    TransactionalConnection,
    ProcessContext,
    Role,
    Channel,
    Logger,
    ID,
} from '@vendure/core';
import { Tenant } from '../entities/tenant.entity';
import { Company } from '../entities/company.entity';
import '../types';

@Injectable()
export class TenantChannelHandler implements OnApplicationBootstrap {
    constructor(
        private eventBus: EventBus,
        private roleService: RoleService,
        private connection: TransactionalConnection,
        private processContext: ProcessContext,
    ) {}

    onApplicationBootstrap() {
        if (!this.processContext.isServer) {
            return;
        }

        this.eventBus.ofType(ChannelEvent).subscribe(async (event) => {
            try {
                if (event.type === 'created') {
                    await this.onChannelCreated(event);
                } else if (event.type === 'deleted') {
                    await this.onChannelDeleted(event);
                }
            } catch (err: any) {
                Logger.error(`TenantChannelHandler error: ${err.message}`, 'TenantChannelHandler');
            }
        });
    }

    private async onChannelCreated(event: ChannelEvent) {
        const tenant = await this.getTenantForChannel(event.entity.id);
        if (!tenant) return;

        // Step 1: Add channel to tenant's parent role
        await this.addChannelToRole(event, tenant.parentRoleId, event.entity.id);
        Logger.info(`Added channel ${event.entity.id} to tenant role (tenant: ${tenant.code})`, 'TenantChannelHandler');

        // Step 2: Add channel to company's parent role (if tenant has a company)
        if (tenant.companyId) {
            const company = await this.connection.rawConnection
                .getRepository(Company)
                .findOne({ where: { id: tenant.companyId } });

            if (company) {
                await this.addChannelToRole(event, company.parentRoleId, event.entity.id);
                Logger.info(`Added channel ${event.entity.id} to company role (company: ${company.code})`, 'TenantChannelHandler');
            }
        }
    }

    private async onChannelDeleted(event: ChannelEvent) {
        const tenant = await this.getTenantForChannel(event.entity.id);
        if (!tenant) return;

        // Step 1: Remove from tenant role
        await this.removeChannelFromRole(event, tenant.parentRoleId, event.entity.id);

        // Step 2: Remove from company role
        if (tenant.companyId) {
            const company = await this.connection.rawConnection
                .getRepository(Company)
                .findOne({ where: { id: tenant.companyId } });

            if (company) {
                await this.removeChannelFromRole(event, company.parentRoleId, event.entity.id);
            }
        }
    }

    private async addChannelToRole(event: ChannelEvent, roleId: ID, channelId: ID) {
        const role = await this.connection.rawConnection
            .getRepository(Role)
            .findOne({ where: { id: roleId }, relations: { channels: true } });

        if (!role) return;

        const channelIds = role.channels.map((ch) => ch.id as string);
        if (!channelIds.includes(String(channelId))) {
            channelIds.push(String(channelId));
            await this.roleService.update(event.ctx, { id: role.id, channelIds });
        }
    }

    private async removeChannelFromRole(event: ChannelEvent, roleId: ID, channelId: ID) {
        const role = await this.connection.rawConnection
            .getRepository(Role)
            .findOne({ where: { id: roleId }, relations: { channels: true } });

        if (!role) return;

        const channelIds = role.channels
            .filter((ch) => String(ch.id) !== String(channelId))
            .map((ch) => ch.id as string);

        await this.roleService.update(event.ctx, { id: role.id, channelIds });
    }

    private async getTenantForChannel(channelId: ID): Promise<Tenant | null> {
        const channelRow = await this.connection.rawConnection
            .getRepository(Channel)
            .findOne({ where: { id: channelId } });

        const tenantId = channelRow?.customFields?.tenant?.id;
        if (!tenantId) return null;

        return this.connection.rawConnection
            .getRepository(Tenant)
            .findOne({ where: { id: tenantId }, relations: { company: true } });
    }
}
