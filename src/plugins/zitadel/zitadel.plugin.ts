import { PluginCommonModule, RuntimeVendureConfig, Type, VendurePlugin } from '@vendure/core';

import { ZitadelAuthController } from './api/zitadel-auth.controller';
import { ZITADEL_PLUGIN_OPTIONS } from './constants';
import { WiskoChannelHandler } from './events/wisko-channel.handler';
import { RoleSyncConsumer } from './role-sync/role-sync.consumer';
import { WiskoRoleService } from './services/wisko-role.service';
import { ZitadelAccountCheckService, zitadelAccountCheckTask } from './services/zitadel-account-check.service';
import { ZitadelContextService } from './services/zitadel-context.service';
import { ZitadelSignInService } from './services/zitadel-sign-in.service';
import { ZitadelPluginOptions } from './types';

/** Staff sign in only through ZITADEL (the Wisko sign-in page), and their Store permissions are ticked there. */
@VendurePlugin({
    imports: [PluginCommonModule],
    controllers: [ZitadelAuthController],
    providers: [
        { provide: ZITADEL_PLUGIN_OPTIONS, useFactory: () => ZitadelPlugin.options },
        ZitadelContextService,
        WiskoRoleService,
        ZitadelSignInService,
        ZitadelAccountCheckService,
        WiskoChannelHandler,
        RoleSyncConsumer,
    ],
    dashboard: './dashboard/index.tsx',
    compatibility: '^3.0.0',
    configuration: (config: RuntimeVendureConfig) => {
        config.schedulerOptions.tasks.push(zitadelAccountCheckTask);
        config.customFields.Role.push({
            name: 'wiskoScopeUids',
            type: 'text',
            nullable: true,
            internal: true,
            readonly: true,
            public: false,
        });
        config.customFields.Administrator.push({
            name: 'wiskoRolePosition',
            type: 'string',
            nullable: true,
            internal: true,
            readonly: true,
            public: false,
        });
        return config;
    },
})
export class ZitadelPlugin {
    static options: ZitadelPluginOptions;

    static init(options: ZitadelPluginOptions): Type<ZitadelPlugin> {
        this.options = options;
        return ZitadelPlugin;
    }
}
