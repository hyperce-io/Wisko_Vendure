import { graphql, ResultOf } from '@/gql';

const faqAssignmentFragment = graphql(`
    fragment FaqAssignmentFragment on FaqAssignment {
        id
        targetType
        targetKey
        position
        enabled
        product {
            id
            name
        }
    }
`);

const faqFragment = graphql(
    `
        fragment FaqFragment on Faq {
            id
            question
            answer
            enabled
            languageCode
            translations {
                id
                question
                languageCode
                answer
            }
            assignments {
                ...FaqAssignmentFragment
            }
            createdAt
            updatedAt
        }
    `,
    [faqAssignmentFragment],
);

export const getFaqListQuery = graphql(
    `
        query GetFaqList($options: FaqListOptions) {
            faqs(options: $options) {
                items {
                    ...FaqFragment
                }
                totalItems
            }
        }
    `,
    [faqFragment],
);

export const getFaqDetailQuery = graphql(
    `
        query GetFaqDeatail($id: ID!) {
            faq(id: $id) {
                ...FaqFragment
            }
        }
    `,
    [faqFragment],
);

export const createFaqMutation = graphql(
    `
        mutation CreateFaq($input: CreateFaqInput!) {
            createFaq(input: $input) {
                ...FaqFragment
            }
        }
    `,
    [faqFragment],
);

export const updateFaqMutation = graphql(
    `
        mutation UpdateFaq($input: UpdateFaqInput!) {
            updateFaq(input: $input) {
                ...FaqFragment
            }
        }
    `,
    [faqFragment],
);

export const deleteFaqMutation = graphql(`
    mutation DeleteFaqs($ids: [ID!]!) {
        deleteFaq(ids: $ids) {
            message
            result
        }
    }
`);

export const getFaqsForTargetQuery = graphql(
    `
        query GetFaqsForTarget($target: FaqTargetType!, $id: String!) {
            faqs(target: $target, id: $id) {
                items {
                    ...FaqFragment
                }
                totalItems
            }
        }
    `,
    [faqFragment],
);

export const reorderFaqAssignmentsMutation = graphql(
    `
        mutation ReorderFaqAssignments($input: FaqAssignmentReorderInput!) {
            reorderFaqAssignments(input: $input) {
                ...FaqFragment
            }
        }
    `,
    [faqFragment],
);

export const addFaqAssignmentMutation = graphql(
    `
        mutation AddFaqAssignment($faqId: ID!, $input: FaqAssignmentInput!) {
            addFaqAssignment(faqId: $faqId, input: $input) {
                ...FaqFragment
            }
        }
    `,
    [faqFragment],
);

export const removeFaqAssignmentMutation = graphql(
    `
        mutation RemoveFaqAssignment($faqId: ID!, $target: FaqTargetType!, $id: String!) {
            removeFaqAssignment(faqId: $faqId, target: $target, id: $id) {
                ...FaqFragment
            }
        }
    `,
    [faqFragment],
);

/**
 * Lightweight FAQ list for pickers on the Product-detail FAQ tab.
 */
export const getFaqPickerListQuery = graphql(`
    query GetFaqPickerList($options: FaqListOptions) {
        faqs(options: $options) {
            items {
                id
                question
                enabled
            }
            totalItems
        }
    }
`);

/**
 * Product picker used on the FAQ detail "Appears on → Products" section.
 */
export const getProductsForFaqPickerQuery = graphql(`
    query GetProductsForFaqPicker($options: ProductListOptions) {
        products(options: $options) {
            items {
                id
                name
            }
            totalItems
        }
    }
`);

export const getCollectionsForFaqPickerQuery = graphql(`
    query GetCollectionsForFaqPicker($options: CollectionListOptions) {
        collections(options: $options) {
            items {
                id
                name
            }
            totalItems
        }
    }
`);
