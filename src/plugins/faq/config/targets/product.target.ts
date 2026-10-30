import { ProductService } from '@vendure/core';

import { FaqTargetTypeDefinition } from '../faq-target-types';

export const PRODUCT_TARGET_CODE = 'product';

/**
 * Attach FAQs to a Product. The `targetKey` is the product id as a string.
 *
 * Also used for "service pages" since services in this codebase are Products
 * with the `isService` custom field set to true
 * (see `src/plugins/service-request/service-request.plugin.ts:35`).
 */
export const productFaqTarget: FaqTargetTypeDefinition = {
    code: PRODUCT_TARGET_CODE,
    label: 'Product',
    async validate(ctx, injector, targetKey) {
        const productService = injector.get(ProductService);
        const product = await productService.findOne(ctx, targetKey);
        return !!product;
    },
    async resolveDisplay(ctx, injector, targetKey) {
        const productService = injector.get(ProductService);
        const product = await productService.findOne(ctx, targetKey);
        if (!product) return null;
        return { label: product.name, url: `/products/${product.slug}` };
    },
};
