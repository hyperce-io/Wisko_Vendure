import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';

import {
    MutationApproveProductReviewArgs,
    MutationRejectProductReviewArgs,
    MutationUpdateProductReviewArgs,
    QueryProductReviewArgs,
    QueryProductReviewsArgs,
} from '../../../codegen/adminTypes';
import { ProductReviewService } from '../services/product-review.service';

@Resolver()
export class ProductReviewAdminResolver {
    constructor(private productReviewService: ProductReviewService) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    productReviews(@Ctx() ctx: RequestContext, @Args() args: QueryProductReviewsArgs) {
        return this.productReviewService.findAll(ctx, args.options);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    productReview(@Ctx() ctx: RequestContext, @Args() args: QueryProductReviewArgs) {
        return this.productReviewService.findOne(ctx, args.id);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCatalog)
    updateProductReview(@Ctx() ctx: RequestContext, @Args() args: MutationUpdateProductReviewArgs) {
        return this.productReviewService.update(ctx, args.input);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCatalog)
    approveProductReview(@Ctx() ctx: RequestContext, @Args() args: MutationApproveProductReviewArgs) {
        return this.productReviewService.approve(ctx, args.id);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCatalog)
    rejectProductReview(@Ctx() ctx: RequestContext, @Args() args: MutationRejectProductReviewArgs) {
        return this.productReviewService.reject(ctx, args.id);
    }
}
