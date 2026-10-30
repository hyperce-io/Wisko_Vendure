import { DeepPartial, EntityId, ID, Product, VendureEntity } from '@vendure/core';
import { Entity, ManyToOne } from 'typeorm';

@Entity()
export class WishlistItem extends VendureEntity {
    constructor(input?: DeepPartial<WishlistItem>) {
        super(input);
    }

    @ManyToOne(type => Product)
    product: Product;

    @EntityId()
    productId: ID;
}
