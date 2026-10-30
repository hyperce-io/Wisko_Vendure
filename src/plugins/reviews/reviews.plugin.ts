import { LanguageCode, PluginCommonModule, VendurePlugin } from '@vendure/core';

import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { ProductEntityResolver } from './api/product-entity.resolver';
import { ProductReviewAdminResolver } from './api/product-review-admin.resolver';
import { ProductReviewEntityResolver } from './api/product-review-entity.resolver';
import { ProductReviewShopResolver } from './api/product-review-shop.resolver';
import { ProductReview } from './entities/product-review.entity';
import { ProductReviewService } from './services/product-review.service';
import './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [ProductReview],
    compatibility: '^3.0.0',
    providers: [ProductReviewService],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [ProductEntityResolver, ProductReviewAdminResolver, ProductReviewEntityResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [ProductEntityResolver, ProductReviewShopResolver, ProductReviewEntityResolver],
    },
    dashboard: './dashboard/index.tsx',
    configuration: config => {
        config.customFields.Product.push(
            {
                name: 'reviewRating',
                label: [{ languageCode: LanguageCode.en, value: 'Review rating' }],
                public: true,
                nullable: true,
                readonly: true,
                type: 'float',
                ui: { tab: 'Reviews' },
            },
            {
                name: 'reviewCount',
                label: [{ languageCode: LanguageCode.en, value: 'Review count' }],
                public: true,
                defaultValue: 0,
                readonly: true,
                type: 'int',
                ui: { tab: 'Reviews' },
            },
            {
                name: 'featuredReview',
                label: [{ languageCode: LanguageCode.en, value: 'Featured review' }],
                public: true,
                nullable: true,
                type: 'relation',
                entity: ProductReview,
                ui: { tab: 'Reviews', component: 'featured-review-selector' },
                validate: async (reviewId, injector, ctx) => {
                    if (reviewId == null) {
                        return;
                    }
                    const isApproved = await injector
                        .get(ProductReviewService)
                        .isApprovedInActiveChannel(ctx, reviewId);
                    if (!isApproved) {
                        return 'The featured review must be an approved review of a product in this channel';
                    }
                },
            },
        );
        return config;
    },
})
export class ReviewsPlugin {}
