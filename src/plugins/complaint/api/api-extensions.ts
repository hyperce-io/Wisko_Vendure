import { gql } from 'graphql-tag';

export const commonApiExtensions = gql`
    enum ComplaintIssueType {
        WRONG_OR_DAMAGED_ITEM
        MISSING_ITEM
        LATE_DELIVERY
        WRONG_SIZE
        PAYMENT_ISSUE
        OTHER
    }

    enum ComplaintStatus {
        OPEN
        IN_PROGRESS
        RESOLVED
    }

    type Complaint implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        issueType: ComplaintIssueType!
        status: ComplaintStatus!
        description: String!
        order: Order!
        customer: Customer!
        image: Asset
    }

    type ComplaintList implements PaginatedList {
        items: [Complaint!]!
        totalItems: Int!
    }

    input ComplaintListOptions
    
    input ComplaintSortParameter {
        issueType: SortOrder
        status: SortOrder
    }
`;

export const adminApiExtensions = gql`
    ${commonApiExtensions}

    extend type Complaint {
        adminNote: String
    }

    input UpdateComplaintInput {
        id: ID!
        status: ComplaintStatus
        adminNote: String
    }

    extend type Query {
        complaints(options: ComplaintListOptions): ComplaintList!
        complaint(id: ID!): Complaint
    }

    extend type Mutation {
        updateComplaint(input: UpdateComplaintInput!): Complaint!
    }
`;

export const shopApiExtensions = gql`
    ${commonApiExtensions}

    input CreateComplaintInput {
        orderId: ID!
        issueType: ComplaintIssueType!
        description: String!
        image: Upload
    }

    extend type Query {
        activeCustomerComplaints(options: ComplaintListOptions): ComplaintList!
    }

    extend type Mutation {
        createComplaint(input: CreateComplaintInput!): Complaint!
    }
`;
