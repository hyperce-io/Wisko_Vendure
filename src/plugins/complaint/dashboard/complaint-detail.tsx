import { AnyRoute } from '@tanstack/react-router';
import {
  Badge,
  DashboardRouteDefinition,
  DetailPageButton,
  detailPageRouteLoader,
  FormFieldWrapper,
  Page,
  PageActionBar,
  PageActionBarRight,
  PageBlock,
  PageLayout,
  PageTitle,
  PermissionGuard,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useDetailPage,
} from '@vendure/dashboard';
import { toast } from 'sonner';

import { getComplaintDetailQuery, updateComplaintMutation } from './complaint.graphql';

function StatusBadge({ status }: { status?: string }) {
  if (status === 'RESOLVED') {
    return <Badge variant="success">Resolved</Badge>;
  }
  if (status === 'IN_PROGRESS') {
    return <Badge variant="secondary">In progress</Badge>;
  }
  return <Badge variant="destructive">Open</Badge>;
}

function formatIssueType(issueType?: string) {
  if (!issueType) {
    return '—';
  }
  return issueType
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const complaintDetail: DashboardRouteDefinition = {
  path: '/complaints/$id',
  loader: detailPageRouteLoader({
    queryDocument: getComplaintDetailQuery,
    breadcrumb: (_isNew, entity) => [
      { path: '/complaints', label: 'Complaints' },
      entity?.order?.code || `Complaint #${entity?.id ?? ''}`,
    ],
  }),
  component: route => <ComplaintDetailPage route={route as AnyRoute} />,
};

function ComplaintDetailPage({ route }: { route: AnyRoute }) {
  const params = route.useParams();

  const { form, submitHandler, entity, isPending } = useDetailPage({
    queryDocument: getComplaintDetailQuery,
    updateDocument: updateComplaintMutation,
    params: { id: params.id },
    setValuesForUpdate: complaint => ({
      id: complaint?.id ?? '',
      status: complaint?.status ?? 'OPEN',
      adminNote: complaint?.adminNote ?? '',
    }),
    onSuccess: () => toast.success('Successfully updated complaint'),
    onError: err =>
      toast.error('Failed to update complaint', {
        description: err instanceof Error ? err.message : 'Unknown error',
      }),
  });

  return (
    <Page pageId="complaint-detail" form={form} submitHandler={submitHandler}>
      <PageTitle>{entity?.order?.code || `Complaint #${entity?.id ?? ''}`}</PageTitle>
      <PageActionBar>
        <PageActionBarRight>
          <PermissionGuard requires={['UpdateOrder']}>
            <Button type="submit" disabled={!form.formState.isDirty || !form.formState.isValid || isPending}>
              Update
            </Button>
          </PermissionGuard>
        </PageActionBarRight>
      </PageActionBar>
      <PageLayout>
        <PageBlock column="side" blockId="complaint-info" title="Complaint info">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status={entity?.status} />
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Issue type</span>
              <span>{formatIssueType(entity?.issueType)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Order</span>
              {entity?.order ? (
                <DetailPageButton
                  className="border"
                  href={`/orders/${entity.order.id}`}
                  label={entity.order.code}
                />
              ) : (
                <span>—</span>
              )}
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Customer</span>
              <span>
                {entity?.customer ? `${entity.customer.firstName} ${entity.customer.lastName}` : '—'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Email</span>
              <span>{entity?.customer?.emailAddress || '—'}</span>
            </div>
          </div>
        </PageBlock>
        <PageBlock column="main" blockId="complaint-details" title="Details">
          <div className="space-y-6">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Description</div>
              <div className="text-sm whitespace-pre-wrap">{entity?.description || '—'}</div>
            </div>
            {entity?.image?.preview ? (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Attached image</div>
                <img
                  src={entity.image.preview}
                  alt="Complaint attachment"
                  className="max-w-xs rounded-md border"
                />
              </div>
            ) : null}
            <FormFieldWrapper
              control={form.control}
              name="status"
              label="Status"
              render={({ field }) => (
                <Select value={field.value ?? 'OPEN'} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <FormFieldWrapper
              control={form.control}
              name="adminNote"
              label="Internal note"
              description="An internal note visible only to admins."
              render={({ field }) => <Textarea {...field} value={field.value ?? ''} rows={4} />}
            />
          </div>
        </PageBlock>
      </PageLayout>
    </Page>
  );
}
