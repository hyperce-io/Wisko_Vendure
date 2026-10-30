import { Badge, DashboardRouteDefinition, DetailPageButton, ListPage } from '@vendure/dashboard';

import { getComplaintListQuery } from './complaint.graphql';

function StatusBadge({ status }: { status: string }) {
  if (status === 'RESOLVED') {
    return <Badge variant="success">Resolved</Badge>;
  }
  if (status === 'IN_PROGRESS') {
    return <Badge variant="secondary">In progress</Badge>;
  }
  return <Badge variant="destructive">Open</Badge>;
}

function formatIssueType(issueType: string) {
  return issueType
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const complaintList: DashboardRouteDefinition = {
  path: '/complaints',
  navMenuItem: {
    sectionId: 'sales',
    id: 'complaints',
    url: '/complaints',
    title: 'Complaints',
    requiresPermission: 'ReadOrder',
  },
  loader: () => ({ breadcrumb: 'Complaints' }),
  component: route => (
    <ListPage
      pageId="complaint-list"
      title="Complaints"
      listQuery={getComplaintListQuery}
      route={route}
      onSearchTermChange={searchTerm => ({
        description: { contains: searchTerm },
      })}
      defaultSort={[{ id: 'createdAt', desc: true }]}
      defaultVisibility={{
        order: true,
        customer: true,
        issueType: true,
        status: true,
        createdAt: true,
      }}
      customizeColumns={{
        order: {
          header: 'Order',
          cell: ({ row }) =>
            row.original.order ? (
              <DetailPageButton href={`/orders/${row.original.order.id}`} label={row.original.order.code} />
            ) : (
              <span>—</span>
            ),
        },
        customer: {
          header: 'Customer',
          cell: ({ row }) => (
            <span>
              {row.original.customer
                ? `${row.original.customer.firstName} ${row.original.customer.lastName}`
                : '—'}
            </span>
          ),
        },
        issueType: {
          header: 'Issue type',
          cell: ({ row }) => (
            <DetailPageButton id={row.original.id} label={formatIssueType(row.original.issueType)} />
          ),
        },
        status: {
          header: 'Status',
          cell: ({ row }) => <StatusBadge status={row.original.status} />,
        },
      }}
    />
  ),
};
