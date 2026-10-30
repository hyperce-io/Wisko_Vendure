import gql from 'graphql-tag';

export const extensions = gql`
    type WishlistItem implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        product: Product!
        productId: ID!
    }

    type WishlistItems implements PaginatedList {
        items: [WishlistItem!]!
        totalItems: Int!
    }

    type WishlistResponse {
        success: Boolean!
        message: String!
        items: [WishlistItem!]!
    }

    extend type Product {
        isInWishlist: Boolean!
        wishListId: ID
    }

    input WishlistPaginationOptions {
        skip: Int
        take: Int
    }

    extend type Query {
        activeCustomerWishlist(options: WishlistPaginationOptions): WishlistItems!
    }

    extend type Mutation {
        addToWishlist(productId: ID!): [WishlistItem!]!
        removeFromWishlist(productId: ID!): WishlistResponse!
    }
`;
