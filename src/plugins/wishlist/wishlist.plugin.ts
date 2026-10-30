import { LanguageCode, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { extensions } from './api/api-extensions';
import { WishlistShopResolver, WishlistShopResolverProduct } from './api/wishlist.resolver';
import { WishlistItem } from './entities/wishlist-item.entity';
import { WishlistService } from './service/wishlist.service';
import './types';
@VendurePlugin({
    imports: [PluginCommonModule],
    compatibility: '^3.0.0',
    entities: [WishlistItem],
    providers: [WishlistService],
    shopApiExtensions: {
        schema: extensions,
        resolvers: [WishlistShopResolver, WishlistShopResolverProduct],
    },
    adminApiExtensions: {
        schema: extensions,
        resolvers: [WishlistShopResolver, WishlistShopResolverProduct],
    },
    configuration: config => {
        config.customFields.Customer.push({
            name: 'wishlistItems',
            type: 'relation',
            entity: WishlistItem,
            label: [{ languageCode: LanguageCode.en, value: 'Wishlist items' }],
            list: true,
            readonly: true,
        });
        return config;
    },
})
export class WishlistPlugin {}
