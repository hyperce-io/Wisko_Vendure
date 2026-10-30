import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import {
    Allow,
    CollectionService,
    Ctx,
    ID,
    ProductService,
    RequestContext,
    Transaction,
} from '@vendure/core';

import {
    MutationAddFaqAssignmentArgs,
    MutationCreateFaqArgs,
    MutationDeleteFaqArgs,
    MutationRemoveFaqAssignmentArgs,
    MutationReorderFaqAssignmentsArgs,
    MutationUpdateFaqArgs,
    QueryFaqArgs,
    QueryFaqsArgs,
} from '../../../codegen/adminTypes';
import { faqPermission } from '../constants';
import { enumToTargetCode, resolveTargetCode, targetCodeToEnum } from '../config/faq-target-types';
import { COLLECTION_TARGET_CODE } from '../config/targets/collection.target';
import { PRODUCT_TARGET_CODE } from '../config/targets/product.target';
import { FaqAssignment } from '../entities/faq-assignment.entity';
import { FaqService } from '../services/faq.service';

@Resolver()
export class FaqAdminResolver {
    constructor(
        private faqService: FaqService,
        private productService: ProductService,
    ) {}

    @Allow(faqPermission.Create)
    @Mutation()
    async createFaq(@Ctx() ctx: RequestContext, @Args() args: MutationCreateFaqArgs) {
        return this.faqService.create(ctx, args.input);
    }

    @Allow(faqPermission.Update)
    @Mutation()
    async updateFaq(@Ctx() ctx: RequestContext, @Args() args: MutationUpdateFaqArgs) {
        return this.faqService.update(ctx, args.input);
    }

    @Allow(faqPermission.Read)
    @Query()
    async faqs(@Ctx() ctx: RequestContext, @Args() args: QueryFaqsArgs) {
        const { target, id, options } = args;
        if ((target && !id) || (id && !target)) {
            throw new Error(`The 'target' and 'id' arguments must be provided together`);
        }
        if (target && id) {
            const code = normalizeTargetToCode(target);
            // Admin: include disabled FAQs and disabled assignments.
            return this.faqService.findAll(ctx, options, {
                targetType: code,
                targetKey: String(id),
                enabledOnly: false,
            });
        }
        return this.faqService.findAll(ctx, options);
    }

    @Allow(faqPermission.Read)
    @Query()
    async faq(@Ctx() ctx: RequestContext, @Args() args: QueryFaqArgs) {
        return this.faqService.findOne(ctx, args.id);
    }

    @Transaction()
    @Allow(faqPermission.Delete)
    @Mutation()
    async deleteFaq(@Ctx() ctx: RequestContext, @Args() args: MutationDeleteFaqArgs) {
        return this.faqService.delete(ctx, args.ids);
    }

    @Transaction()
    @Allow(faqPermission.Update)
    @Mutation()
    async reorderFaqAssignments(@Ctx() ctx: RequestContext, @Args() args: MutationReorderFaqAssignmentsArgs) {
        const { target, id, faqIds } = args.input;
        const code = normalizeTargetToCode(target);
        return this.faqService.reorderAssignments(ctx, code, String(id), faqIds);
    }

    @Transaction()
    @Allow(faqPermission.Update)
    @Mutation()
    async addFaqAssignment(@Ctx() ctx: RequestContext, @Args() args: MutationAddFaqAssignmentArgs) {
        return this.faqService.addAssignment(ctx, args.faqId, args.input);
    }

    @Transaction()
    @Allow(faqPermission.Update)
    @Mutation()
    async removeFaqAssignment(@Ctx() ctx: RequestContext, @Args() args: MutationRemoveFaqAssignmentArgs) {
        return this.faqService.removeAssignment(ctx, args.faqId, args.target, String(args.id));
    }
}

@Resolver('Faq')
export class FaqAdminEntityResolver {
    @ResolveField()
    assignments(@Parent() faq: any): FaqAssignment[] {
        // Assignments are eager-loaded on the Faq entity, so we can pass them
        // through directly. Sort by (targetType, position) for stable output.
        const list: FaqAssignment[] = Array.isArray(faq.assignments) ? faq.assignments : [];
        return [...list].sort((a, b) => {
            if (a.targetType !== b.targetType) return a.targetType.localeCompare(b.targetType);
            return a.position - b.position;
        });
    }
}

/**
 * Resolver for `FaqAssignment` field-level conversions.
 *
 * - `targetType`: converts the neutral lowercase registry code stored in the
 *   database (e.g. `'product'`) into the uppercased `FaqTargetType` GraphQL
 *   enum value (e.g. `'PRODUCT'`). Without this, GraphQL rejects the raw
 *   string with "Enum FaqTargetType cannot represent value: 'product'".
 * - `product`: convenience field that hydrates a `Product` when the assignment
 *   targets a product.
 */
@Resolver('FaqAssignment')
export class FaqAssignmentEntityResolver {
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

/**
 * Adds a `Product.faqs` field on the admin API.
 */
@Resolver('Product')
export class ProductAdminEntityResolver {
    constructor(private faqService: FaqService) {}

    @ResolveField()
    async faqs(@Ctx() ctx: RequestContext, @Parent() product: { id: ID }) {
        const result = await this.faqService.findForProduct(ctx, product.id, false);
        return result.items;
    }
}

@Resolver('Collection')
export class CollectionAdminEntityResolver {
    constructor(private faqService: FaqService) {}

    @ResolveField()
    async faqs(@Ctx() ctx: RequestContext, @Parent() collection: { id: ID }) {
        const result = await this.faqService.findForCollection(ctx, collection.id, false);
        return result.items;
    }
}

function normalizeTargetToCode(target: string): string {
    return resolveTargetCode(target) ?? enumToTargetCode(target);
}
