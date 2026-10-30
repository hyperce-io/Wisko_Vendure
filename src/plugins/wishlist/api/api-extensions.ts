import gql from "graphql-tag";

export const extensions = gql`
  type WishlistItem implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    product: Product!
    productId: ID!
  }

  type WishlistItemList implements PaginatedList {
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

  input WishlistItemListOptions

  extend type Query {
    activeCustomerWishlist(options: WishlistItemListOptions): WishlistItemList!
  }

  extend type Mutation {
    addToWishlist(productId: ID!): [WishlistItem!]!
    removeFromWishlist(productId: ID!): WishlistResponse!
  }
`;
