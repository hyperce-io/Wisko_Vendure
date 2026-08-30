import gql from 'graphql-tag';

export const shopApiExtensions = gql`
    type StoreChannel {
        id: ID!
        code: String!
        token: String!
        name: String!
        currencyCode: CurrencyCode!
        languageCode: LanguageCode!
    }

    extend type Query {
        """
        Returns all available store channels (Level 3 — actual stores that sell products).
        Use the returned token in the 'vendure-token' header to browse that store's products.
        """
        availableStores: [StoreChannel!]!
    }
`;
