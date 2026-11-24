import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ChannelEvent, EventBus, Logger } from '@vendure/core';

import { loggerCtx } from '../constants';
import { WiskoRoleService } from '../services/wisko-role.service';
import { ZitadelContextService } from '../services/zitadel-context.service';

/** Channels are created by the ERP sync (worker) and in the dashboard (server), so both processes listen. */
@Injectable()
export class WiskoChannelHandler implements OnApplicationBootstrap {
    constructor(
        private eventBus: EventBus,
        private contextService: ZitadelContextService,
        private wiskoRoleService: WiskoRoleService,
    ) {}

    onApplicationBootstrap() {
        this.eventBus.ofType(ChannelEvent).subscribe(async event => {
            if (event.type !== 'created') return;
            try {
                const ctx = await this.contextService.superAdminContext();
                await this.wiskoRoleService.coverNewChannel(ctx, event.entity.id);
            } catch (error) {
                Logger.error(`Could not add channel ${event.entity.id} to wisko: roles: ${error instanceof Error ? error.message : String(error)}`, loggerCtx);
            }
        });
    }
}
