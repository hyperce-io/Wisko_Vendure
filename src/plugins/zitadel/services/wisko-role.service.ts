// What ZITADEL says each person may do in the Store, applied as Vendure roles (wisko-auth docs/vendureAuth.md B2, B3).
// Ticks are grouped by their scope set; each group is one role `wisko:<zitadelUserId>:<hash>` holding the ticked
// permissions on the channels of that scope. Roles without the `wisko:` prefix are never changed (SuperAdmin aside).
import { Injectable } from '@nestjs/common';
import {
    Administrator,
    AdministratorService,
    Channel,
    ExternalAuthenticationService,
    ID,
    idsAreEqual,
    Logger,
    Permission,
    RequestContext,
    Role,
    RoleService,
    SessionService,
    TransactionalConnection,
} from '@vendure/core';
import { createHash } from 'node:crypto';

import { ACCESS_ROLE, loggerCtx, WISKO_ROLE_PREFIX, ZITADEL_STRATEGY_NAME } from '../constants';
import { UserRolesMessage, VendureRoleCatalog } from '../types';

interface WantedRole {
    code: string;
    scopeUids: string[];
    permissions: Permission[];
}

interface Store {
    channelId: ID;
    /** The store's own uid and those of its Organization and Super Organization. */
    uids: string[];
}

const ROLE_PAGE_SIZE = 500;

const storeOf = (channel: Channel): Store => ({
    channelId: channel.id,
    uids: [
        channel.customFields.erpChannelId,
        channel.customFields.tenant?.code,
        channel.customFields.tenant?.company?.code,
    ].filter((uid): uid is string => Boolean(uid)),
});

const scopeUidsOf = (role: Role): string[] => {
    const scopeUids: unknown = JSON.parse(role.customFields.wiskoScopeUids || '[]');
    return Array.isArray(scopeUids) ? scopeUids.filter((uid): uid is string => typeof uid === 'string') : [];
};

const hasSameIds = (left: ID[], right: ID[]) =>
    left.length === right.length && left.every(leftId => right.some(rightId => idsAreEqual(leftId, rightId)));

@Injectable()
export class WiskoRoleService {
    constructor(
        private connection: TransactionalConnection,
        private roleService: RoleService,
        private administratorService: AdministratorService,
        private externalAuthenticationService: ExternalAuthenticationService,
        private sessionService: SessionService,
    ) {}

    async applyUserRoles(ctx: RequestContext, message: UserRolesMessage, catalog: VendureRoleCatalog): Promise<void> {
        const user = await this.externalAuthenticationService.findAdministratorUser(
            ctx,
            ZITADEL_STRATEGY_NAME,
            message.zitadelUserId,
        );
        const administrator = user
            ? await this.administratorService.findOneByUserId(ctx, user.id, ['user', 'user.roles'])
            : undefined;
        if (!user || !administrator) {
            if (this.isStoreAccessWanted(message)) {
                // The ERP sync creates the admin moments after the ZITADEL account: the consumer retries, then dead-letters.
                throw new Error(`no Vendure admin is linked to ${message.email ?? message.zitadelUserId} yet`);
            }
            Logger.verbose(`user.roles for ${message.zitadelUserId}: no Vendure admin is linked to it; skipped`, loggerCtx);
            return;
        }
        const lastPosition = administrator.customFields.wiskoRolePosition;
        if (lastPosition && message.position < lastPosition) {
            Logger.info(`user.roles for ${message.zitadelUserId} at ${message.position} is older than ${lastPosition}; skipped`, loggerCtx);
            return;
        }
        if (!message.active || message.deleted) {
            await this.sessionService.deleteSessionsByUser(ctx, user);
        }

        const personRoles = await this.findRolesWithCodeContaining(ctx, `${WISKO_ROLE_PREFIX}${message.zitadelUserId}:`);
        const stores = await this.loadStores(ctx);
        const wiskoRoles: Role[] = [];
        for (const wantedRole of message.deleted ? [] : this.wantedRoles(message, catalog)) {
            wiskoRoles.push(await this.saveRole(ctx, wantedRole, personRoles, stores));
        }

        const superAdminRole = await this.roleService.getSuperAdminRole(ctx);
        const currentRoleIds = administrator.user.roles.map(role => role.id);
        const roleIds = [
            ...administrator.user.roles
                .filter(role => !role.code.startsWith(WISKO_ROLE_PREFIX) && !idsAreEqual(role.id, superAdminRole.id))
                .map(role => role.id),
            ...(message.platformAdmin && !message.deleted ? [superAdminRole.id] : []),
            ...wiskoRoles.map(role => role.id),
        ];
        await this.administratorService.update(ctx, {
            id: administrator.id,
            roleIds: hasSameIds(currentRoleIds, roleIds) ? undefined : roleIds,
            customFields: { wiskoRolePosition: message.position },
        });

        const unusedRoles = personRoles.filter(role => !wiskoRoles.some(wiskoRole => idsAreEqual(wiskoRole.id, role.id)));
        for (const role of unusedRoles) {
            await this.roleService.delete(ctx, role.id);
        }
        Logger.info(
            `user.roles for ${message.email ?? message.zitadelUserId}: ${wiskoRoles.map(role => role.code).join(', ') || 'no Store roles'}` +
                `${message.platformAdmin ? ' + SuperAdmin' : ''}${unusedRoles.length ? `; removed ${unusedRoles.length} old roles` : ''}`,
            loggerCtx,
        );
    }

    /** ZITADEL decides who is a platform administrator: SuperAdmin follows its platform-admin role. */
    async setPlatformAdmin(ctx: RequestContext, administrator: Administrator, isPlatformAdmin: boolean): Promise<void> {
        const superAdminRole = await this.roleService.getSuperAdminRole(ctx);
        const holdsSuperAdmin = administrator.user.roles.some(role => idsAreEqual(role.id, superAdminRole.id));
        if (holdsSuperAdmin === isPlatformAdmin) return;
        const otherRoleIds = administrator.user.roles
            .filter(role => !idsAreEqual(role.id, superAdminRole.id))
            .map(role => role.id);
        await this.administratorService.update(ctx, {
            id: administrator.id,
            roleIds: isPlatformAdmin ? [...otherRoleIds, superAdminRole.id] : otherRoleIds,
        });
        Logger.info(`${isPlatformAdmin ? 'Gave' : 'Took'} SuperAdmin ${isPlatformAdmin ? 'to' : 'from'} ${administrator.emailAddress}`, loggerCtx);
    }

    /** A new store joins every wisko: role whose scope covers it. */
    async coverNewChannel(ctx: RequestContext, channelId: ID): Promise<void> {
        const channel = await this.connection.getRepository(ctx, Channel).findOne({
            where: { id: channelId },
            relations: { customFields: { tenant: { company: true } } },
        });
        const store = channel ? storeOf(channel) : undefined;
        if (!store?.uids.length) return;
        const wiskoRoles = await this.findRolesWithCodeContaining(ctx, WISKO_ROLE_PREFIX);
        const coveringRoles = wiskoRoles.filter(role => scopeUidsOf(role).some(uid => store.uids.includes(uid)));
        for (const role of coveringRoles) {
            await this.roleService.assignRoleToChannel(ctx, role.id, channelId);
        }
        if (coveringRoles.length) {
            Logger.info(`Added new channel ${channelId} to ${coveringRoles.length} wisko: roles`, loggerCtx);
        }
    }

    /** Someone the ERP makes a Store admin for: active, not a platform admin, holding "Store: access" for some place. */
    private isStoreAccessWanted(message: UserRolesMessage): boolean {
        return (
            message.active &&
            !message.deleted &&
            !message.platformAdmin &&
            message.roles.some(tick => tick.role === ACCESS_ROLE && tick.scopes.length > 0)
        );
    }

    private wantedRoles(message: UserRolesMessage, catalog: VendureRoleCatalog): WantedRole[] {
        const scopedTicks = message.roles.filter(tick => tick.scopes.length > 0);
        if (!scopedTicks.some(tick => tick.role === ACCESS_ROLE)) return [];
        const validPermissions = this.roleService.getAllPermissions();
        const isPermission = (name: string): name is Permission => validPermissions.includes(name);

        const rolesByScope = scopedTicks.reduce((groups, tick) => {
            const permissionNames = catalog.rolePermissions.get(tick.role);
            if (!permissionNames) {
                Logger.warn(`user.roles for ${message.zitadelUserId}: vendure.${tick.role} is not in catalog version ${catalog.version}; ignored`, loggerCtx);
                return groups;
            }
            const unknownNames = permissionNames.filter(name => !isPermission(name));
            if (unknownNames.length) {
                Logger.warn(`vendure.${tick.role}: ${unknownNames.join(', ')} are not Vendure permissions; ignored`, loggerCtx);
            }
            const scopeUids = [...new Set(tick.scopes)].sort();
            const scopeKey = scopeUids.join(',');
            const group = groups.get(scopeKey) ?? { scopeUids, permissions: new Set<Permission>() };
            for (const permission of permissionNames.filter(isPermission)) {
                group.permissions.add(permission);
            }
            return groups.set(scopeKey, group);
        }, new Map<string, { scopeUids: string[]; permissions: Set<Permission> }>());

        return [...rolesByScope.values()].map(({ scopeUids, permissions }) => ({
            code: `${WISKO_ROLE_PREFIX}${message.zitadelUserId}:${createHash('sha256').update(scopeUids.join(',')).digest('hex').slice(0, 12)}`,
            scopeUids,
            permissions: [...permissions],
        }));
    }

    private async saveRole(ctx: RequestContext, wantedRole: WantedRole, personRoles: Role[], stores: Store[]): Promise<Role> {
        const channelIds = stores
            .filter(store => store.uids.some(uid => wantedRole.scopeUids.includes(uid)))
            .map(store => store.channelId);
        const wiskoScopeUids = JSON.stringify(wantedRole.scopeUids);
        const existingRole = personRoles.find(role => role.code === wantedRole.code);
        if (!existingRole) {
            return this.roleService.create(ctx, {
                code: wantedRole.code,
                description: `Wisko role sync: Store permissions ticked in ZITADEL for ${wantedRole.scopeUids.join(', ')}`,
                permissions: wantedRole.permissions,
                channelIds,
                customFields: { wiskoScopeUids },
            });
        }
        const wantedPermissions = [...new Set([Permission.Authenticated, ...wantedRole.permissions])];
        const isUnchanged =
            existingRole.permissions.length === wantedPermissions.length &&
            wantedPermissions.every(permission => existingRole.permissions.includes(permission)) &&
            hasSameIds(existingRole.channels.map(channel => channel.id), channelIds) &&
            existingRole.customFields.wiskoScopeUids === wiskoScopeUids;
        if (isUnchanged) return existingRole;
        return this.roleService.update(ctx, {
            id: existingRole.id,
            permissions: wantedRole.permissions,
            channelIds,
            customFields: { wiskoScopeUids },
        });
    }

    /** ChannelService cannot load a channel's Tenant and Company (custom-field relations of the tenant plugin). */
    private async loadStores(ctx: RequestContext): Promise<Store[]> {
        const channels = await this.connection.getRepository(ctx, Channel).find({
            relations: { customFields: { tenant: { company: true } } },
        });
        return channels.map(storeOf);
    }

    private async findRolesWithCodeContaining(ctx: RequestContext, codePart: string): Promise<Role[]> {
        const roles: Role[] = [];
        // Batching: one page of roles at a time.
        for (let skip = 0; ; skip += ROLE_PAGE_SIZE) {
            const page = await this.roleService.findAll(ctx, {
                filter: { code: { contains: codePart } },
                take: ROLE_PAGE_SIZE,
                skip,
            });
            roles.push(...page.items.filter(role => role.code.startsWith(codePart)));
            if (skip + ROLE_PAGE_SIZE >= page.totalItems) return roles;
        }
    }
}
