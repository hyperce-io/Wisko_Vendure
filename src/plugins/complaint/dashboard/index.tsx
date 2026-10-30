import { api, defineDashboardExtension } from '@vendure/dashboard';

import { complaintDetail } from './complaint-detail';
import { complaintList } from './complaint-list';
import { activeAdminPermissionsQuery, openComplaintCountQuery } from './complaint.graphql';

// `null` == cannot read orders, or the check failed. Either way the alert stays hidden.
type OpenComplaintCount = number | null;

export default defineDashboardExtension({
  alerts: [
    {
      id: 'open-complaint-alert',
      check: async (): Promise<OpenComplaintCount> => {
        try {
          // Alerts have no `requiresPermissions` option, so gate on ReadOrder here rather
          // than firing a query the server would reject for admins who cannot see orders.
          const admin = await api.query(activeAdminPermissionsQuery);
          const canReadOrders = (admin.me?.channels ?? []).some(channel =>
            channel.permissions.includes('ReadOrder'),
          );
          if (!canReadOrders) {
            return null;
          }
          // `take: 1` rather than 0 — TypeORM treats a take of 0 as "no limit" and would
          // load every open complaint just to read totalItems.
          const data = await api.query(openComplaintCountQuery, {
            options: { take: 1, filter: { status: { eq: 'OPEN' } } },
          });
          return data.complaints?.totalItems ?? 0;
        } catch {
          return null;
        }
      },
      recheckInterval: 300_000, // 5 min
      shouldShow: (count: OpenComplaintCount) => typeof count === 'number' && count > 0,
      title: (count: OpenComplaintCount) => `${count} open complaint${count === 1 ? '' : 's'}`,
      description: () => 'Click "View complaints" to resolve them.',
      severity: () => 'warning',
      actions: [
        {
          label: 'View complaints',
          onClick: () => window.location.assign('/dashboard/complaints'),
        },
      ],
    },
  ],
  routes: [complaintList, complaintDetail],
});
