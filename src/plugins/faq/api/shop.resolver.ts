import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { CollectionService, Ctx, ID, ProductService, RequestContext } from '@vendure/core';

import { QueryFaqsArgs } from '../../../codegen/shopTypes';
import { enumToTargetCode, resolveTargetCode, targetCodeToEnum } from '../config/faq-target-types';
import { COLLECTION_TARGET_CODE } from '../config/targets/collection.target';
import { PRODUCT_TARGET_CODE } from '../config/targets/product.target';
import { FaqAssignment } from '../entities/faq-assignment.entity';
import { FaqService } from '../services/faq.service';

@Resolver()
export class FaqShopResolver {
    constructor(private faqService: FaqService) {}

    @Query()
    async faqs(@Ctx() ctx: RequestContext, @Args() args: QueryFaqsArgs) {
        const { target, id, options } = args;
        if ((target && !id) || (id && !target)) {
            throw new Error(`The 'target' and 'id' arguments must be provided together`);
        }
        if (target && id) {
            const code = normalizeTargetToCode(target);
            return this.faqService.findAll(ctx, options, {
                targetType: code,
                targetKey: String(id),
                enabledOnly: true,
            });
        }
        // Backwards-compatible flat list, restricted to enabled FAQs.
        return this.faqService.findAll(ctx, {
            ...(options ?? {}),
            filter: { ...(options?.filter ?? {}), enabled: { eq: true } },
        });
    }
}

/**
 * Adds a nested `Product.faqs` field to the shop API.
 */
@Resolver('Product')
export class ProductShopEntityResolver {
    constructor(private faqService: FaqService) {}

    @ResolveField()
    async faqs(@Ctx() ctx: RequestContext, @Parent() product: { id: ID }) {
        const result = await this.faqService.findForProduct(ctx, product.id, true);
        return result.items;
    }
}

@Resolver('Collection')
export class CollectionShopEntityResolver {
    constructor(private faqService: FaqService) {}

    @ResolveField()
    async faqs(@Ctx() ctx: RequestContext, @Parent() collection: { id: ID }) {
        const result = await this.faqService.findForCollection(ctx, collection.id, true);
        return result.items;
    }
}

/**
 * Shop-side Faq.assignments field: filter out disabled assignments so the
 * storefront never sees them.
 */
@Resolver('Faq')
export class FaqShopEntityResolver {
    @ResolveField()
    assignments(@Parent() faq: any): FaqAssignment[] {
        const list: FaqAssignment[] = Array.isArray(faq.assignments) ? faq.assignments : [];
        return list
            .filter(a => a.enabled)
            .sort((a, b) => {
                if (a.targetType !== b.targetType) return a.targetType.localeCompare(b.targetType);
                return a.position - b.position;
            });
    }
}

/**
 * Shop-side `FaqAssignment` field resolvers:
 * - `targetType`: converts the lowercase DB registry code (`'product'`) into
 *   the uppercased `FaqTargetType` enum value (`'PRODUCT'`) so the GraphQL
 *   layer can serialize it.
 * - `product`: hydrates a Product when the assignment targets one.
 */
@Resolver('FaqAssignment')
export class FaqAssignmentShopEntityResolver {
    constructor(
        private productService: ProductService,
        private collectionService: CollectionService,
    ) {}

    @ResolveField()
    targetType(@Parent() assignment: FaqAssignment): string {
        return targetCodeToEnum(assignment.targetType);
    }

    @ResolveField()
    async product(@Ctx() ctx: RequestContext, @Parent() assignment: FaqAssignment) {
        if (assignment.targetType !== PRODUCT_TARGET_CODE) return null;
        return this.productService.findOne(ctx, assignment.targetKey);
    }

    @ResolveField()
    async collection(@Ctx() ctx: RequestContext, @Parent() assignment: FaqAssignment) {
        if (assignment.targetType !== COLLECTION_TARGET_CODE) return null;
        return this.collectionService.findOne(ctx, assignment.targetKey);
    }
}

function normalizeTargetToCode(target: string): string {
    return resolveTargetCode(target) ?? enumToTargetCode(target);
}
