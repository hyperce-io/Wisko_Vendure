import { Injectable } from '@nestjs/common';
import { ConfigService, RequestContext, RequestContextService, UserService } from '@vendure/core';

/** Role sync, the account check and sign-in act for the platform, so they run as Vendure's superadmin. */
@Injectable()
export class ZitadelContextService {
    constructor(
        private configService: ConfigService,
        private userService: UserService,
        private requestContextService: RequestContextService,
    ) {}

    async superAdminContext(): Promise<RequestContext> {
        const anonymousCtx = await this.requestContextService.create({ apiType: 'admin' });
        const superAdmin = await this.userService.getUserByEmailAddress(
            anonymousCtx,
            this.configService.authOptions.superadminCredentials.identifier,
            'administrator',
        );
        if (!superAdmin) throw new Error('Vendure superadmin user not found');
        return this.requestContextService.create({ apiType: 'admin', user: superAdmin });
    }
}
