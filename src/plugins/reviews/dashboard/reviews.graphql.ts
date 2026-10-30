import { graphql } from '@/gql';

export const getProductReviewsDocument = graphql(`
    query GetProductReviews($options: ProductReviewListOptions) {
        productReviews(options: $options) {
            items {
                id
                createdAt
                summary
                rating
                state
                authorName
                authorLocation
                product {
                    id
                    name
                }
            }
            totalItems
        }
    }
`);

export const getProductReviewDetailDocument = graphql(`
    query GetProductReview($id: ID!) {
        productReview(id: $id) {
            id
            createdAt
            summary
            body
            rating
            state
            authorName
            authorLocation
            product {
                id
                name
            }
            productVariant {
                id
                name
            }
            response
            responseCreatedAt
        }
    }
`);

export const approveProductReviewDocument = graphql(`
    mutation ApproveProductReview($id: ID!) {
        approveProductReview(id: $id) {
            id
            state
        }
    }
`);

export const rejectProductReviewDocument = graphql(`
    mutation RejectProductReview($id: ID!) {
        rejectProductReview(id: $id) {
            id
            state
        }
    }
`);

export const getApprovedProductReviewsDocument = graphql(`
    query GetApprovedProductReviews($id: ID!) {
        product(id: $id) {
            id
            reviews(options: { filter: { state: { eq: "approved" } }, sort: { createdAt: DESC }, take: 100 }) {
                items {
                    id
                    summary
                    rating
                    authorName
                }
            }
        }
    }
`);
