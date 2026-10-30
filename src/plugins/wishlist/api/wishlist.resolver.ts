import {
    Args,
    Mutation,
    Parent,
    Query,
    ResolveField,
    Resolver,
} from "@nestjs/graphql";
import {
    Allow,
    Ctx,
    Permission,
    Product,
    RequestContext,
    Transaction,
} from "@vendure/core";

import {
    MutationAddToWishlistArgs,
    MutationRemoveFromWishlistArgs,
    QueryActiveCustomerWishlistArgs,
} from "../../../codegen/shopTypes";
import { WishlistService } from "../service/wishlist.service";

@Resolver("Product")
export class WishlistShopResolverProduct {
  constructor(private wishlistService: WishlistService) {}

  @ResolveField()
  isInWishlist(@Ctx() ctx: RequestContext, @Parent() parent: Product) {
    return this.wishlistService.isInWishlist(ctx, parent.id);
  }

  @ResolveField()
  wishListId(@Ctx() ctx: RequestContext, @Parent() parent: Product) {
    return this.wishlistService.wishlistID(ctx, parent.id);
  }
}

@Resolver()
export class WishlistShopResolver {
  constructor(private wishlistService: WishlistService) {}

  @Query()
  @Allow(Permission.Owner)
  activeCustomerWishlist(
    @Ctx() ctx: RequestContext,
    @Args() args: QueryActiveCustomerWishlistArgs,
  ) {
    return this.wishlistService.getPaginatedWishlist(ctx, args.options);
  }

  @Mutation()
  @Allow(Permission.Owner)
  async addToWishlist(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationAddToWishlistArgs,
  ) {
    return this.wishlistService.addItem(ctx, args.productId);
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.Owner)
  async removeFromWishlist(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationRemoveFromWishlistArgs,
  ) {
    return this.wishlistService.removeItem(ctx, args.productId);
  }
}
