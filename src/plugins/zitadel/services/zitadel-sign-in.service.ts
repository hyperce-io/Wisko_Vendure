// Who may sign in through ZITADEL: an admin linked to the ZITADEL account (made by the ERP sync) who holds
// "Store: access", or a platform administrator (created on first sign-in, as in the other Wisko apps).
import { Injectable } from '@nestjs/common';
import { AdministratorService, ExternalAuthenticationService, RoleService, User } from '@vendure/core';

import { ZITADEL_STRATEGY_NAME } from '../constants';
import { SignInRefused } from '../oidc';
import { ZitadelIdentity } from '../types';
import { WiskoRoleService } from './wisko-role.service';
import { ZitadelContextService } from './zitadel-context.service';

@Injectable()
export class ZitadelSignInService {
    constructor(
        private contextService: ZitadelContextService,
        private externalAuthenticationService: ExternalAuthenticationService,
        private administratorService: AdministratorService,
        private roleService: RoleService,
        private wiskoRoleService: WiskoRoleService,
    ) {}

    async findAdminUser(identity: ZitadelIdentity): Promise<User> {
        const ctx = await this.contextService.superAdminContext();
        const user = await this.externalAuthenticationService.findAdministratorUser(
            ctx,
            ZITADEL_STRATEGY_NAME,
            identity.zitadelUserId,
        );
        if (!user && identity.isPlatformAdmin) {
            return this.externalAuthenticationService.createAdministratorAndUser(ctx, {
                strategy: ZITADEL_STRATEGY_NAME,
                externalIdentifier: identity.zitadelUserId,
                identifier: identity.email,
                emailAddress: identity.email,
                firstName: identity.firstName || identity.email,
                lastName: identity.lastName,
                roles: [await this.roleService.getSuperAdminRole(ctx)],
            });
        }
        if (!user || !(identity.isPlatformAdmin || identity.hasStoreAccess)) {
            throw new SignInRefused(`${identity.email} has no Store access`);
        }
        const administrator = await this.administratorService.findOneByUserId(ctx, user.id, ['user', 'user.roles']);
        if (!administrator) throw new SignInRefused(`${identity.email} is not a Store administrator`);
        await this.wiskoRoleService.setPlatformAdmin(ctx, administrator, identity.isPlatformAdmin);
        return user;
    }
}
