import { gql } from 'graphql-tag';

import { faqTargetTypeRegistry, targetCodeToEnum } from '../config/faq-target-types';

/**
 * Build the `FaqTargetType` and `FaqPageKey` GraphQL enums dynamically from
 * the registry + the configured `pageKeys`. Called at plugin bootstrap.
 */
export function buildDynamicFaqEnumsSdl(pageKeys: readonly string[]): string {
    const targetValues = faqTargetTypeRegistry
        .codes()
        .map(code => targetCodeToEnum(code))
        .join('\n        ');
    const pageValues = (pageKeys.length > 0 ? pageKeys : ['home']).map(key => `"${key}"`).join(', ');

    // NOTE: `FaqPageKey` is a String scalar (with a documented allowed-list)
    // rather than an enum because GraphQL enum values must match /[_A-Za-z][_0-9A-Za-z]*/
    // and page keys are free-form strings (`'about-us'`, `'shipping-info'`, …).
    // Validation still happens server-side via the page target's `validate`.
    return /* GraphQL */ `
        """
        Discriminator for FAQ assignment targets. Values are derived from the
        registered target types at bootstrap (built-in: PRODUCT, PAGE).
        """
        enum FaqTargetType {
            ${targetValues}
        }

        """
        Known page keys accepted as \`targetKey\` when \`targetType = PAGE\`.
        Configured via \`FaqPlugin.init({ pageKeys })\`. Currently accepted values: ${pageValues}.
        """
        scalar FaqPageKey
    `;
}

/**
 * Common SDL shared by admin and shop APIs. Everything that is not
 * target-type-registry-dependent lives here.
 */
export const commonSdl = gql`
    type Faq implements Node {
        id: ID!
        question: String
        answer: String
        enabled: Boolean!
        languageCode: LanguageCode
        translations: [FaqTranslation!]!
        assignments: [FaqAssignment!]!
        createdAt: DateTime!
        updatedAt: DateTime!
    }

    type FaqTranslation implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        languageCode: LanguageCode!
        question: String!
        answer: String!
    }

    type FaqAssignment implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        targetType: FaqTargetType!
        targetKey: String!
        position: Int!
        enabled: Boolean!
        """
        Resolved product when \`targetType = PRODUCT\`, otherwise null.
        """
        product: Product
        collection: Collection
    }

    type FaqList implements PaginatedList {
        items: [Faq!]!
        totalItems: Int!
    }

    input FaqListOptions
`;
