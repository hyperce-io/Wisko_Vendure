import { DocumentNode } from 'graphql';
import { gql } from 'graphql-tag';

import { buildDynamicFaqEnumsSdl, commonSdl } from './build-schema';

/**
 * Build the shop-API SDL. The `FaqTargetType` enum values are generated at
 * runtime from the registered target types, so a new target type added via
 * `FaqPlugin.init({ additionalTargetTypes })` automatically appears in the API.
 */
export function buildShopApiExtensions(pageKeys: readonly string[]): DocumentNode {
    return gql`
        ${commonSdl}
        ${buildDynamicFaqEnumsSdl(pageKeys)}

        extend type Query {
            """
            List FAQs. When \`target\` + \`id\` are provided, returns only FAQs
            assigned to that target (ordered by per-assignment \`position\`).
            When omitted, returns a paginated global list (backwards compatible).
            """
            faqs(target: FaqTargetType, id: String, options: FaqListOptions): FaqList!
        }

        extend type Product {
            """
            FAQs assigned to this product, ordered by per-assignment position.
            Only enabled assignments of enabled FAQs are returned.
            """
            faqs: [Faq!]!
        }

        extend type Collection {
            faqs: [Faq!]!
        }
    `;
}

export function buildAdminApiExtensions(pageKeys: readonly string[]): DocumentNode {
    return gql`
        ${commonSdl}
        ${buildDynamicFaqEnumsSdl(pageKeys)}

        input FaqTranslationInput {
            id: ID
            languageCode: LanguageCode!
            question: String!
            answer: String!
        }

        input FaqAssignmentInput {
            targetType: FaqTargetType!
            targetKey: String!
            position: Int
            enabled: Boolean
        }

        input CreateFaqInput {
            enabled: Boolean!
            translations: [FaqTranslationInput!]!
            assignments: [FaqAssignmentInput!]
        }

        input UpdateFaqInput {
            id: ID!
            question: String
            answer: String
            enabled: Boolean
            translations: [FaqTranslationInput!]!
            """
            When provided, fully replaces the FAQ's assignments (delete + insert).
            Omit to leave assignments untouched.
            """
            assignments: [FaqAssignmentInput!]
        }

        input FaqAssignmentReorderInput {
            target: FaqTargetType!
            id: String!
            """
            FAQ ids in the desired order. Must contain every FAQ currently
            assigned to the target; missing ids are rejected.
            """
            faqIds: [ID!]!
        }

        extend type Mutation {
            createFaq(input: CreateFaqInput!): Faq!
            updateFaq(input: UpdateFaqInput!): Faq!
            deleteFaq(ids: [ID!]!): DeletionResponse!
            """
            Add a single assignment to an FAQ (append to its assignments list).
            Idempotent: if an equivalent assignment already exists, position is
            updated but no duplicate row is created.
            """
            addFaqAssignment(faqId: ID!, input: FaqAssignmentInput!): Faq!
            """
            Remove a single assignment from an FAQ by target coordinates.
            No-op if no matching assignment exists.
            """
            removeFaqAssignment(faqId: ID!, target: FaqTargetType!, id: String!): Faq!
            """
            Atomically re-order all FAQs assigned to a given target.
            Returns the reordered FAQ list.
            """
            reorderFaqAssignments(input: FaqAssignmentReorderInput!): [Faq!]!
        }

        extend type Query {
            faq(id: ID!): Faq
            faqs(target: FaqTargetType, id: String, options: FaqListOptions): FaqList!
        }

        extend type Product {
            """
            FAQs assigned to this product (admin view — includes disabled).
            """
            faqs: [Faq!]!
        }

        extend type Collection {
            faqs: [Faq!]!
        }
    `;
}
