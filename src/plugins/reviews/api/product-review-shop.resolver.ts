import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';

import { MutationSubmitProductReviewArgs, MutationVoteOnReviewArgs } from '../../../codegen/shopTypes';
import { ProductReviewService } from '../services/product-review.service';

@Resolver()
export class ProductReviewShopResolver {
    constructor(private productReviewService: ProductReviewService) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.Authenticated)
    submitProductReview(@Ctx() ctx: RequestContext, @Args() args: MutationSubmitProductReviewArgs) {
        return this.productReviewService.submit(ctx, args.input);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.Authenticated)
    voteOnReview(@Ctx() ctx: RequestContext, @Args() args: MutationVoteOnReviewArgs) {
        return this.productReviewService.vote(ctx, args.id, args.vote);
    }
}
