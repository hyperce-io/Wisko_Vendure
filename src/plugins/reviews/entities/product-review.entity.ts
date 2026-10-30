import { Customer, DeepPartial, Product, ProductVariant, VendureEntity } from '@vendure/core';
import { Column, Entity, ManyToOne } from 'typeorm';

import { ReviewState } from '../types';

@Entity()
export class ProductReview extends VendureEntity {
    constructor(input?: DeepPartial<ProductReview>) {
        super(input);
    }

    @ManyToOne(() => Product)
    product: Product;

    @ManyToOne(() => ProductVariant, { nullable: true })
    productVariant: ProductVariant | null;

    @Column()
    summary: string;

    @Column('text')
    body: string;

    @Column('float')
    rating: number;

    @ManyToOne(() => Customer, { nullable: true })
    author: Customer | null;

    @Column()
    authorName: string;

    @Column('varchar', { nullable: true })
    authorLocation: string | null;

    @Column({ default: 0 })
    upvotes: number;

    @Column({ default: 0 })
    downvotes: number;

    @Column('varchar')
    state: ReviewState;

    @Column('text', { nullable: true, default: null })
    response: string | null;

    @Column('timestamp', { nullable: true, default: null })
    responseCreatedAt: Date | null;
}
