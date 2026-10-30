import {
  api,
  Button,
  DashboardRouteDefinition,
  detailPageRouteLoader,
  Label,
  Page,
  PageBlock,
  PageLayout,
  PageTitle,
  useQueryClient,
  useSuspenseQuery,
  AnyRoute,
  toast,
} from '@vendure/dashboard';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import {
  approveProductReviewDocument,
  getProductReviewDetailDocument,
  rejectProductReviewDocument,
} from './reviews.graphql';

export const reviewDetail: DashboardRouteDefinition = {
  path: '/reviews/$id',
  loader: detailPageRouteLoader({
    queryDocument: getProductReviewDetailDocument,
    breadcrumb: (isNew, entity) => [
      { path: '/reviews', label: 'Reviews' },
      entity?.summary ?? entity?.id ?? 'Review',
    ],
  }),
  component: route => {
    return <ReviewDetailPage route={route as AnyRoute} />;
  },
};

function ReviewDetailPage({ route }: { route: AnyRoute }) {
  const params = route.useParams();
  const queryClient = useQueryClient();

  const { data, refetch } = useSuspenseQuery({
    queryKey: ['product-review', params.id],
    queryFn: () => api.query(getProductReviewDetailDocument, { id: params.id }),
  });

  const entity = data?.productReview;
  if (!entity) {
    throw new Error(`Review with the ID ${params.id} was not found`);
  }

  const state = entity.state as 'new' | 'approved' | 'rejected';
  const canApprove = state === 'new' || state === 'rejected';
  const canReject = state !== 'rejected';

  const handleApprove = async () => {
    try {
      await api.mutate(approveProductReviewDocument)({
        id: entity.id,
      });
      toast.success('Review approved');
      await queryClient.invalidateQueries();
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve review';
      toast.error(message);
    }
  };

  const handleReject = async () => {
    try {
      await api.mutate(rejectProductReviewDocument)({
        id: entity.id,
      });
      toast.success('Review rejected');
      await queryClient.invalidateQueries();
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject review';
      toast.error(message);
    }
  };

  const getStateBadge = () => {
    const baseClasses = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium';
    switch (state) {
      case 'approved':
        return (
          <span className={`${baseClasses} bg-emerald-500/10 text-emerald-700`}>
            <CheckCircle2 className="h-3 w-3" />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className={`${baseClasses} bg-destructive/10 text-destructive`}>
            <XCircle className="h-3 w-3" />
            Rejected
          </span>
        );
      default:
        return (
          <span className={`${baseClasses} bg-blue-500/10 text-blue-700`}>
            <Clock className="h-3 w-3" />
            New
          </span>
        );
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <span key={star} className={`text-lg ${star <= rating ? 'text-amber-500' : 'text-gray-300'}`}>
            ★
          </span>
        ))}
        <span className="ml-2 text-sm font-medium text-muted-foreground">{rating.toFixed(1)}</span>
      </div>
    );
  };

  return (
    <Page pageId="review-detail">
      <PageTitle>
        <div className="flex items-center justify-between">
          <span>{entity.summary ?? `Review #${entity.id}`}</span>
          <div className="flex items-center gap-3">
            {getStateBadge()}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-600/60 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                disabled={!canApprove}
                onClick={handleApprove}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/60 text-destructive hover:bg-destructive hover:text-white"
                disabled={!canReject}
                onClick={handleReject}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </div>
          </div>
        </div>
      </PageTitle>
      <PageLayout>
        <PageBlock column="main" blockId="main-form">
          <div className="space-y-6">
            {/* Review Information Card */}
            <div className="rounded-lg border bg-card p-6">
              <h3 className="mb-4 text-lg font-semibold">Review Information</h3>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Product</Label>
                  <div className="text-base font-medium">
                    {entity.product?.name ?? `#${entity.product?.id ?? '—'}`}
                  </div>
                  {entity.productVariant && (
                    <div className="text-sm text-muted-foreground">Variant: {entity.productVariant.name}</div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Rating</Label>
                  {renderStars(entity.rating)}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Author</Label>
                  <div className="text-base font-medium">{entity.authorName}</div>
                  {entity.authorLocation && (
                    <div className="text-sm text-muted-foreground">{entity.authorLocation}</div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Created At</Label>
                  <div className="text-base">{formatDate(entity.createdAt)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-6">
              <h3 className="mb-4 text-lg font-semibold">Review Content</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Summary</Label>
                  <div className="rounded-md border bg-background p-3 text-base">{entity.summary ?? '—'}</div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Review Body</Label>
                  <div className="rounded-md border bg-background p-3 text-base whitespace-pre-wrap">
                    {entity.body ?? '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Response Card */}
            {entity.response && (
              <div className="rounded-lg border bg-card p-6">
                <h3 className="mb-4 text-lg font-semibold">Response</h3>
                <div className="space-y-2">
                  <div className="rounded-md border bg-background p-3 text-base whitespace-pre-wrap">
                    {entity.response}
                  </div>
                  {entity.responseCreatedAt && (
                    <div className="text-sm text-muted-foreground">
                      Responded on {formatDate(entity.responseCreatedAt)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </PageBlock>
      </PageLayout>
    </Page>
  );
}
