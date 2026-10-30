import { Args, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Api, ApiType, Ctx, Product, RequestContext } from '@vendure/core';

import { ProductReviewsArgs } from '../../../codegen/shopTypes';
import { ProductReviewService } from '../services/product-review.service';

@Resolver('Product')
export class ProductEntityResolver {
    constructor(private productReviewService: ProductReviewService) {}

    @ResolveField()
    reviews(
        @Ctx() ctx: RequestContext,
        @Api() apiType: ApiType,
        @Parent() product: Product,
        @Args() args: ProductReviewsArgs,
    ) {
        return this.productReviewService.findAllForProduct(ctx, product.id, apiType === 'shop', args.options);
    }

    @ResolveField()
    reviewsHistogram(@Ctx() ctx: RequestContext, @Parent() product: Product) {
        return this.productReviewService.getHistogram(ctx, product.id);
    }
}
