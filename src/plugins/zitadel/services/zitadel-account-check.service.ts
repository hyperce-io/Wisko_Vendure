// Every minute (D7): admins whose ZITADEL account is deactivated, locked or deleted are signed out, and SuperAdmin is
// taken from admins ZITADEL no longer names platform-admin. ZITADEL unreachable: nobody is changed.
import { Inject, Injectable } from '@nestjs/common';
import {
    AdministratorService,
    ExternalAuthenticationMethod,
    idsAreEqual,
    Logger,
    RoleService,
    ScheduledTask,
    SessionService,
    User,
} from '@vendure/core';

import { ACCOUNT_CHECK_BATCH_SIZE, loggerCtx, ZITADEL_PLUGIN_OPTIONS, ZITADEL_STRATEGY_NAME } from '../constants';
import { ZitadelPluginOptions } from '../types';
import { findClosedAccounts, findPlatformAdmins } from '../zitadel-api';
import { WiskoRoleService } from './wisko-role.service';
import { ZitadelContextService } from './zitadel-context.service';

const zitadelUserIdOf = (user: User): string | undefined =>
    user.authenticationMethods
        .filter((method): method is ExternalAuthenticationMethod => method instanceof ExternalAuthenticationMethod)
        .find(method => method.strategy === ZITADEL_STRATEGY_NAME)?.externalIdentifier;

@Injectable()
export class ZitadelAccountCheckService {
    constructor(
        @Inject(ZITADEL_PLUGIN_OPTIONS) private options: ZitadelPluginOptions,
        private contextService: ZitadelContextService,
        private administratorService: AdministratorService,
        private roleService: RoleService,
        private sessionService: SessionService,
        private wiskoRoleService: WiskoRoleService,
    ) {}

    async checkAccounts(): Promise<{ checkedCount: number; closedCount: number }> {
        const ctx = await this.contextService.superAdminContext();
        const superAdminRole = await this.roleService.getSuperAdminRole(ctx);
        const platformAdmins = await findPlatformAdmins(this.options);
        let checkedCount = 0;
        let closedCount = 0;
        // Batching: one page of administrators at a time.
        for (let skip = 0; ; skip += ACCOUNT_CHECK_BATCH_SIZE) {
            const page = await this.administratorService.findAll(
                ctx,
                { take: ACCOUNT_CHECK_BATCH_SIZE, skip },
                ['user', 'user.roles', 'user.authenticationMethods'],
            );
            const linkedAdmins = page.items.flatMap(administrator => {
                const zitadelUserId = zitadelUserIdOf(administrator.user);
                return zitadelUserId ? [{ administrator, zitadelUserId }] : [];
            });
            const closedAccounts = linkedAdmins.length
                ? await findClosedAccounts(this.options, linkedAdmins.map(linkedAdmin => linkedAdmin.zitadelUserId))
                : new Set<string>();
            for (const { administrator, zitadelUserId } of linkedAdmins) {
                if (closedAccounts.has(zitadelUserId)) {
                    await this.sessionService.deleteSessionsByUser(ctx, administrator.user);
                }
                const holdsSuperAdmin = administrator.user.roles.some(role => idsAreEqual(role.id, superAdminRole.id));
                if (holdsSuperAdmin && !platformAdmins.has(zitadelUserId)) {
                    await this.wiskoRoleService.setPlatformAdmin(ctx, administrator, false);
                }
            }
            checkedCount += linkedAdmins.length;
            closedCount += closedAccounts.size;
            if (skip + ACCOUNT_CHECK_BATCH_SIZE >= page.totalItems) break;
        }
        if (closedCount) Logger.verbose(`Account check: ${closedCount} of ${checkedCount} ZITADEL accounts are closed; their sessions are deleted`, loggerCtx);
        return { checkedCount, closedCount };
    }
}

export const zitadelAccountCheckTask = new ScheduledTask({
    id: 'wisko-zitadel-account-check',
    description: 'Sign out admins whose ZITADEL account is closed and take SuperAdmin from former platform admins',
    schedule: cron => cron.everyMinute(),
    async execute({ injector }) {
        return injector.get(ZitadelAccountCheckService).checkAccounts();
    },
});
