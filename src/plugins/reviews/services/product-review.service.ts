import { Injectable } from '@nestjs/common';
import {
    Customer,
    CustomerService,
    ForbiddenError,
    ID,
    ListQueryBuilder,
    PaginatedList,
    patchEntity,
    Product,
    ProductService,
    ProductVariant,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { FindOptionsWhere } from 'typeorm';

import { UpdateProductReviewInput } from '../../../codegen/adminTypes';
import {
    ProductReviewHistogramItem,
    ProductReviewListOptions,
    SubmitProductReviewInput,
} from '../../../codegen/shopTypes';
import { ProductReview } from '../entities/product-review.entity';
import '../types';

const MIN_RATING = 1;
const MAX_RATING = 5;

@Injectable()
export class ProductReviewService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private productService: ProductService,
        private customerService: CustomerService,
    ) {}

    async findAll(
        ctx: RequestContext,
        options?: ProductReviewListOptions,
    ): Promise<PaginatedList<ProductReview>> {
        const [items, totalItems] = await this.listQueryBuilder
            .build(ProductReview, options, {
                where: this.inActiveChannel(ctx),
                relations: ['product'],
                ctx,
            })
            .getManyAndCount();
        return { items, totalItems };
    }

    async findAllForProduct(
        ctx: RequestContext,
        productId: ID,
        isApprovedOnly: boolean,
        options?: ProductReviewListOptions,
    ): Promise<PaginatedList<ProductReview>> {
        const [items, totalItems] = await this.listQueryBuilder
            .build(ProductReview, options, {
                where: {
                    product: { id: productId },
                    ...(isApprovedOnly ? { state: 'approved' } : {}),
                },
                relations: ['product', 'product.featuredAsset'],
                ctx,
            })
            .getManyAndCount();
        return { items, totalItems };
    }

    findOne(ctx: RequestContext, id: ID): Promise<ProductReview | null> {
        return this.connection.getRepository(ctx, ProductReview).findOne({
            where: { id, ...this.inActiveChannel(ctx) },
            relations: {
                author: true,
                product: true,
                productVariant: true,
            },
        });
    }

    async getHistogram(ctx: RequestContext, productId: ID): Promise<ProductReviewHistogramItem[]> {
        // Postgres returns ROUND() as numeric and COUNT() as bigint, both of which arrive as strings.
        const rows: Array<{ bin: string; frequency: string }> = await this.connection
            .getRepository(ctx, ProductReview)
            .createQueryBuilder('review')
            .innerJoin('review.product', 'product')
            .select('ROUND(review.rating)', 'bin')
            .addSelect('COUNT(*)', 'frequency')
            .where('product.id = :productId', { productId })
            .andWhere('review.state = :state', { state: 'approved' })
            .groupBy('ROUND(review.rating)')
            .getRawMany();
        return rows.map(row => ({ bin: Number(row.bin), frequency: Number(row.frequency) }));
    }

    async submit(ctx: RequestContext, input: SubmitProductReviewInput): Promise<ProductReview> {
        if (input.rating < MIN_RATING || input.rating > MAX_RATING) {
            throw new UserInputError(`Rating must be between ${MIN_RATING} and ${MAX_RATING}`);
        }
        const product = await this.connection.getEntityOrThrow(ctx, Product, input.productId, {
            channelId: ctx.channelId,
        });
        const productVariant = input.variantId
            ? await this.connection.getEntityOrThrow(ctx, ProductVariant, input.variantId, {
                  channelId: ctx.channelId,
                  where: { productId: product.id },
              })
            : null;
        const author = await this.getActiveCustomer(ctx);
        return this.connection.getRepository(ctx, ProductReview).save(
            new ProductReview({
                product,
                productVariant,
                author,
                summary: input.summary,
                body: input.body,
                rating: input.rating,
                authorName: input.authorName,
                authorLocation: input.authorLocation ?? null,
                state: 'new',
            }),
        );
    }

    async vote(ctx: RequestContext, id: ID, isUpvote: boolean): Promise<ProductReview> {
        await this.getActiveCustomer(ctx);
        const review = await this.connection.getEntityOrThrow(ctx, ProductReview, id, {
            where: { state: 'approved', ...this.inActiveChannel(ctx) },
        });
        const repository = this.connection.getRepository(ctx, ProductReview);
        // An atomic increment, so concurrent votes are not lost to a read-then-save race.
        await repository.increment({ id: review.id }, isUpvote ? 'upvotes' : 'downvotes', 1);
        return this.connection.getEntityOrThrow(ctx, ProductReview, review.id);
    }

    async update(ctx: RequestContext, input: UpdateProductReviewInput): Promise<ProductReview> {
        const review = await this.connection.getEntityOrThrow(ctx, ProductReview, input.id, {
            where: this.inActiveChannel(ctx),
        });
        const hasNewResponse = input.response !== undefined && input.response !== review.response;
        const updatedReview = patchEntity(review, input);
        if (hasNewResponse) {
            updatedReview.responseCreatedAt = new Date();
        }
        return this.connection.getRepository(ctx, ProductReview).save(updatedReview);
    }

    async approve(ctx: RequestContext, id: ID): Promise<ProductReview> {
        const review = await this.connection.getEntityOrThrow(ctx, ProductReview, id, {
            where: this.inActiveChannel(ctx),
            relations: ['product'],
        });
        if (review.state === 'approved') {
            return review;
        }
        review.state = 'approved';
        const savedReview = await this.connection.getRepository(ctx, ProductReview).save(review);
        await this.updateProductRating(ctx, review.product.id);
        return savedReview;
    }

    async reject(ctx: RequestContext, id: ID): Promise<ProductReview> {
        const review = await this.connection.getEntityOrThrow(ctx, ProductReview, id, {
            where: this.inActiveChannel(ctx),
            relations: ['product'],
        });
        const wasApproved = review.state === 'approved';
        review.state = 'rejected';
        const savedReview = await this.connection.getRepository(ctx, ProductReview).save(review);
        if (wasApproved) {
            await this.updateProductRating(ctx, review.product.id);
            await this.clearFeaturedReview(ctx, review.id);
        }
        return savedReview;
    }

    async isApprovedInActiveChannel(ctx: RequestContext, id: ID): Promise<boolean> {
        const approvedCount = await this.connection.getRepository(ctx, ProductReview).count({
            where: { id, state: 'approved', ...this.inActiveChannel(ctx) },
        });
        return approvedCount > 0;
    }

    /** Only an approved review can be featured, so a rejected one is unset from any product featuring it. */
    private async clearFeaturedReview(ctx: RequestContext, reviewId: ID): Promise<void> {
        const featuringProducts = await this.connection.getRepository(ctx, Product).find({
            where: { customFields: { featuredReview: { id: reviewId } } },
            select: { id: true },
        });
        for (const product of featuringProducts) {
            await this.productService.update(ctx, {
                id: product.id,
                customFields: { featuredReviewId: null },
            });
        }
    }

    private async getActiveCustomer(ctx: RequestContext): Promise<Customer> {
        const customer = ctx.activeUserId
            ? await this.customerService.findOneByUserId(ctx, ctx.activeUserId)
            : undefined;
        if (!customer) {
            throw new ForbiddenError();
        }
        return customer;
    }

    /**
     * Recomputes the product's review count and average from its approved reviews, rather than
     * adjusting the stored values, so they cannot drift from the reviews themselves.
     */
    private async updateProductRating(ctx: RequestContext, productId: ID): Promise<void> {
        // Postgres returns AVG() as numeric and COUNT() as bigint, both of which arrive as strings.
        const ratingSummary: { average: string | null; count: string } | undefined = await this.connection
            .getRepository(ctx, ProductReview)
            .createQueryBuilder('review')
            .innerJoin('review.product', 'product')
            .select('AVG(review.rating)', 'average')
            .addSelect('COUNT(*)', 'count')
            .where('product.id = :productId', { productId })
            .andWhere('review.state = :state', { state: 'approved' })
            .getRawOne();
        const reviewCount = Number(ratingSummary?.count ?? 0);
        await this.productService.update(ctx, {
            id: productId,
            customFields: {
                reviewCount,
                reviewRating: reviewCount > 0 ? Number(ratingSummary?.average) : null,
            },
        });
    }

    private inActiveChannel(ctx: RequestContext): FindOptionsWhere<ProductReview> {
        return { product: { channels: { id: ctx.channelId } } };
    }
}
