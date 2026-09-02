import gql from 'graphql-tag';

export const adminApiExtensions = gql`
    type TenantChannel {
        id: ID!
        code: String!
        token: String!
        defaultCurrencyCode: CurrencyCode!
        defaultLanguageCode: LanguageCode!
        pricesIncludeTax: Boolean!
        erpChannelId: String
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
        companyId: ID
        channels: [TenantChannel!]!
        administrators: [TenantAdmin!]!
    }

    type TenantList {
        items: [Tenant!]!
        totalItems: Int!
    }

    type Company implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        code: String!
        name: String!
        enabled: Boolean!
        parentRoleId: ID!
        tenants: [Tenant!]!
        channels: [TenantChannel!]!
        administrators: [TenantAdmin!]!
    }

    type CompanyList {
        items: [Company!]!
        totalItems: Int!
    }

    input CreateTenantInput {
        code: String!
        name: String!
        adminEmail: String!
        adminPassword: String!
        channelCode: String
        companyCode: String
        defaultCurrencyCode: CurrencyCode
        defaultLanguageCode: LanguageCode
    }

    input CreateTenantChannelInput {
        code: String!
        token: String!
        defaultCurrencyCode: CurrencyCode
        defaultLanguageCode: LanguageCode
    }

    input CreateCompanyInput {
        code: String!
        name: String!
        adminEmail: String
        adminPassword: String
    }

    input UpdateCompanyInput {
        id: ID!
        name: String
        enabled: Boolean
    }

    input SyncChannelFromErpInput {
        erpChannelId: String!
        tenantCode: String!
        companyCode: String!
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
        companies: CompanyList!
        company(id: ID!): Company
    }

    extend type Mutation {
        createTenant(input: CreateTenantInput!): Tenant!
        createTenantChannel(input: CreateTenantChannelInput!): Channel!
        createCompany(input: CreateCompanyInput!): Company!
        updateCompany(input: UpdateCompanyInput!): Company!
        syncChannelFromErp(input: SyncChannelFromErpInput!): Channel!
        updateTenant(input: UpdateTenantInput!): Tenant!
    }
`;
