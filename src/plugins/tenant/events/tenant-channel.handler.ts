import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    ChannelEvent,
    RoleService,
    TransactionalConnection,
    ProcessContext,
    Role,
    Channel,
} from '@vendure/core';
import { Tenant } from '../entities/tenant.entity';

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
            } catch (err) {
                // Log but don't crash
                console.error('TenantChannelHandler error:', err);
            }
        });
    }

    private async onChannelCreated(event: ChannelEvent) {
        const tenant = await this.getTenantForChannel(event.entity.id);
        if (!tenant) {
            return;
        }

        const parentRole = await this.connection.rawConnection
            .getRepository(Role)
            .findOne({
                where: { id: tenant.parentRoleId },
                relations: { channels: true },
            });

        if (!parentRole) {
            return;
        }

        const channelIds = parentRole.channels.map((ch) => ch.id as string);
        channelIds.push(event.entity.id as string);

        await this.roleService.update(event.ctx, {
            id: parentRole.id,
            channelIds,
        });
    }

    private async onChannelDeleted(event: ChannelEvent) {
        const tenant = await this.getTenantForChannel(event.entity.id);
        if (!tenant) {
            return;
        }

        const parentRole = await this.connection.rawConnection
            .getRepository(Role)
            .findOne({
                where: { id: tenant.parentRoleId },
                relations: { channels: true },
            });

        if (!parentRole) {
            return;
        }

        const channelIds = parentRole.channels
            .filter((ch) => ch.id !== event.entity.id)
            .map((ch) => ch.id as string);

        await this.roleService.update(event.ctx, {
            id: parentRole.id,
            channelIds,
        });
    }

    private async getTenantForChannel(channelId: any): Promise<Tenant | null> {
        const channelRow = await this.connection.rawConnection
            .getRepository(Channel)
            .findOne({ where: { id: channelId } });

        const tenantId = (channelRow as any)?.customFields?.tenant?.id
            ?? (channelRow as any)?.customFieldsTenantId;

        if (!tenantId) {
            return null;
        }

        return this.connection.rawConnection
            .getRepository(Tenant)
            .findOne({ where: { id: tenantId } });
    }
}
