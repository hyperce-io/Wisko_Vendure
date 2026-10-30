import { graphql, ResultOf } from '@/gql';

const complaintFragment = graphql(`
    fragment ComplaintItem on Complaint {
        id
        createdAt
        updatedAt
        issueType
        status
        description
        adminNote
        order {
            id
            code
        }
        customer {
            id
            firstName
            lastName
            emailAddress
        }
        image {
            id
            preview
            source
        }
    }
`);

export const getComplaintListQuery = graphql(
    `
        query GetComplaintList($options: ComplaintListOptions) {
            complaints(options: $options) {
                items {
                    ...ComplaintItem
                }
                totalItems
            }
        }
    `,
    [complaintFragment],
);

export const getComplaintDetailQuery = graphql(
    `
        query GetComplaintDetail($id: ID!) {
            complaint(id: $id) {
                ...ComplaintItem
            }
        }
    `,
    [complaintFragment],
);

export const updateComplaintMutation = graphql(
    `
        mutation UpdateComplaint($input: UpdateComplaintInput!) {
            updateComplaint(input: $input) {
                ...ComplaintItem
            }
        }
    `,
    [complaintFragment],
);

export const activeAdminPermissionsQuery = graphql(`
    query GetActiveAdminPermissions {
        me {
            channels {
                permissions
            }
        }
    }
`);

export const openComplaintCountQuery = graphql(`
    query GetOpenComplaintCount($options: ComplaintListOptions) {
        complaints(options: $options) {
            totalItems
        }
    }
`);

export type ComplaintItem = ResultOf<typeof complaintFragment>;
