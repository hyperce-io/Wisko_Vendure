import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';

import {
    CollectionAdminEntityResolver,
    FaqAdminEntityResolver,
    FaqAdminResolver,
    FaqAssignmentEntityResolver,
    ProductAdminEntityResolver,
} from './api/admin.resolver';
import { buildAdminApiExtensions, buildShopApiExtensions } from './api/extension';
import {
    CollectionShopEntityResolver,
    FaqAssignmentShopEntityResolver,
    FaqShopEntityResolver,
    FaqShopResolver,
    ProductShopEntityResolver,
} from './api/shop.resolver';
import { faqTargetTypeRegistry } from './config/faq-target-types';
import { DEFAULT_FAQ_PAGE_KEYS } from './config/faq-pages';
import { collectionFaqTarget } from './config/targets/collection.target';
import { makePageFaqTarget } from './config/targets/page.target';
import { productFaqTarget } from './config/targets/product.target';
import { FAQ_PLUGIN_OPTIONS, faqPermission } from './constants';
import { Faq } from './entities/faq.entity';
import { FaqAssignment } from './entities/faq-assignment.entity';
import { FaqTranslation } from './entities/faq-translation.entity';
import { FaqService } from './services/faq.service';
import { PluginInitOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [Faq, FaqTranslation, FaqAssignment],
    providers: [{ provide: FAQ_PLUGIN_OPTIONS, useFactory: () => FaqPlugin.options }, FaqService],
    adminApiExtensions: {
        resolvers: [
            FaqAdminResolver,
            FaqAdminEntityResolver,
            FaqAssignmentEntityResolver,
            ProductAdminEntityResolver,
            CollectionAdminEntityResolver,
        ],
        schema: () => buildAdminApiExtensions(FaqPlugin.resolvedPageKeys()),
    },
    shopApiExtensions: {
        schema: () => buildShopApiExtensions(FaqPlugin.resolvedPageKeys()),
        resolvers: [
            FaqShopResolver,
            FaqShopEntityResolver,
            FaqAssignmentShopEntityResolver,
            ProductShopEntityResolver,
            CollectionShopEntityResolver,
        ],
    },
    configuration: config => {
        config.authOptions.customPermissions.push(faqPermission);
        return config;
    },
    dashboard: './dashboard/index.tsx',
    compatibility: '^3.0.0',
})
export class FaqPlugin {
    static options: PluginInitOptions = {};

    static init(options: PluginInitOptions = {}): Type<FaqPlugin> {
        this.options = options;

        // (Re-)build the target-type registry from built-ins + user extensions.
        faqTargetTypeRegistry.reset();
        faqTargetTypeRegistry.register(productFaqTarget);
        faqTargetTypeRegistry.register(collectionFaqTarget);
        faqTargetTypeRegistry.register(makePageFaqTarget(() => this.resolvedPageKeys()));
        for (const additional of options.additionalTargetTypes ?? []) {
            faqTargetTypeRegistry.register(additional);
        }
        return FaqPlugin;
    }

    /** Resolved list of allowed page keys (options ?? default). */
    static resolvedPageKeys(): readonly string[] {
        return this.options.pageKeys ?? DEFAULT_FAQ_PAGE_KEYS;
    }
}
