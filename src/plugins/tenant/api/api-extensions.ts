import gql from 'graphql-tag';

export const adminApiExtensions = gql`
    type TenantChannel {
        id: ID!
        code: String!
        token: String!
        defaultCurrencyCode: CurrencyCode!
        defaultLanguageCode: LanguageCode!
        pricesIncludeTax: Boolean!
    }

    type TenantAdmin {
        id: ID!
        firstName: String!
        lastName: String!
        emailAddress: String!
    }

    type Tenant implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        code: String!
        name: String!
        enabled: Boolean!
        maxChannels: Int!
        parentRoleId: ID!
        channels: [TenantChannel!]!
        administrators: [TenantAdmin!]!
    }

    type TenantList {
        items: [Tenant!]!
        totalItems: Int!
    }

    input CreateTenantInput {
        code: String!
        name: String!
        adminEmail: String!
        adminPassword: String!
        channelCode: String
        defaultCurrencyCode: CurrencyCode
        defaultLanguageCode: LanguageCode
    }

    input CreateTenantChannelInput {
        code: String!
        token: String!
        defaultCurrencyCode: CurrencyCode
        defaultLanguageCode: LanguageCode
    }

    input SyncChannelFromErpInput {
        erpChannelId: String!
        tenantCode: String!
        tenantName: String
        channelCode: String!
        channelToken: String!
        defaultCurrencyCode: CurrencyCode
        defaultLanguageCode: LanguageCode
    }

    input UpdateTenantInput {
        id: ID!
        name: String
        enabled: Boolean
        maxChannels: Int
    }

    extend type Query {
        tenants: TenantList!
        tenant(id: ID!): Tenant
    }

    extend type Mutation {
        createTenant(input: CreateTenantInput!): Tenant!
        createTenantChannel(input: CreateTenantChannelInput!): Channel!
        syncChannelFromErp(input: SyncChannelFromErpInput!): Channel!
        updateTenant(input: UpdateTenantInput!): Tenant!
    }
`;
