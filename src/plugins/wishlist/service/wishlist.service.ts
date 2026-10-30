import { Injectable } from "@nestjs/common";
import {
    Customer,
    CustomerService,
    ForbiddenError,
    ID,
    InternalServerError,
    ProductService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from "@vendure/core";

import { WishlistItemsListOptions } from "../../../codegen/shopTypes";
import { WishlistItem } from "../entities/wishlist-item.entity";

@Injectable()
export class WishlistService {
  constructor(
    private connection: TransactionalConnection,
    private productService: ProductService,
    private customerService: CustomerService,
  ) {}

  async wishlistID(ctx: RequestContext, productId: ID) {
    try {
      const customer = await this.getCustomerWithWishlistItems(ctx);
      return customer.customFields.wishlistItems.find(
        (i) => i.productId === productId,
      )?.id;
    } catch {
      return null;
    }
  }

  async isInWishlist(ctx: RequestContext, productId: ID): Promise<boolean> {
    if (!ctx.activeUserId) {
      return false;
    }
    const customer = await this.customerService.findOneByUserId(
      ctx,
      ctx.activeUserId,
    );
    if (!customer) {
      return false;
    }

    const count = await this.connection
      .getRepository(ctx, Customer)
      .createQueryBuilder("customer")
      .innerJoin("customer.customFields.wishlistItems", "item")
      .where("customer.id = :customerId", { customerId: customer.id })
      .andWhere("item.productId = :productId", { productId })
      .getCount();

    return count > 0;
  }

  async getWishlistItems(ctx: RequestContext): Promise<WishlistItem[]> {
    try {
      const customer = await this.getCustomerWithWishlistItems(ctx);
      return customer.customFields.wishlistItems;
    } catch {
      return [];
    }
  }

  async getPaginatedWishlist(
    ctx: RequestContext,
    options?: WishlistItemsListOptions,
  ): Promise<{ items: WishlistItem[]; totalItems: number }> {
    const all = await this.getWishlistItems(ctx);
    const totalItems = all.length;
    const skip = Math.max(0, options?.skip ?? 0);
    const take = options?.take ?? totalItems;
    const items = all.slice(skip, skip + Math.max(0, take));
    return { items, totalItems };
  }

  async addItem(ctx: RequestContext, productId: ID): Promise<WishlistItem[]> {
    const customer = await this.getCustomerWithWishlistItems(ctx);
    const product = await this.productService.findOne(ctx, productId);
    if (!product) {
      throw new UserInputError(
        `No Product with the id ${productId} could be found`,
      );
    }
    const existingItem = customer.customFields.wishlistItems.find(
      (i) => i.productId === productId,
    );
    if (existingItem) {
      return customer.customFields.wishlistItems;
    }
    const wishlistItem = await this.connection
      .getRepository(ctx, WishlistItem)
      .save(new WishlistItem({ productId }));
    customer.customFields.wishlistItems.push(wishlistItem);
    await this.connection
      .getRepository(ctx, Customer)
      .save(customer, { reload: false });
    return this.getWishlistItems(ctx);
  }

  async removeItem(ctx: RequestContext, productId: ID) {
    try {
      const customer = await this.getCustomerWithWishlistItems(ctx);
      const itemToRemove = customer.customFields.wishlistItems.find(
        (i) => i.productId === productId,
      );

      if (!itemToRemove) {
        return {
          success: false,
          message: `Product with ID ${productId} was not found in your wishlist`,
          items: customer.customFields.wishlistItems,
        };
      }

      await this.connection
        .getRepository(ctx, WishlistItem)
        .remove(itemToRemove);
      customer.customFields.wishlistItems =
        customer.customFields.wishlistItems.filter(
          (i) => i.productId !== productId,
        );
      await this.connection.getRepository(ctx, Customer).save(customer);

      return {
        success: true,
        message: `Product ${productId} was successfully removed from your wishlist`,
        items: customer.customFields.wishlistItems,
      };
    } catch (error) {
      const wishlistItems = await this.getWishlistItems(ctx);
      return {
        success: false,
        message: `Failed to remove product ${productId} from wishlist`,
        items: wishlistItems,
      };
    }
  }

  private async getCustomerWithWishlistItems(
    ctx: RequestContext,
  ): Promise<Customer> {
    if (!ctx.activeUserId) {
      throw new ForbiddenError();
    }

    const customer = await this.connection
      .getRepository(ctx, Customer)
      .findOne({
        where: { user: { id: ctx.activeUserId } },
        relations: {
          customFields: {
            wishlistItems: {
              product: true,
            },
          },
        },
      });
    if (!customer) {
      throw new InternalServerError(`Customer was not found`);
    }
    return customer;
  }
}
