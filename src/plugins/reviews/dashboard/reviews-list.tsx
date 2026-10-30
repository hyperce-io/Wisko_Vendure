import {
  api,
  DashboardRouteDefinition,
  DetailPageButton,
  ListPage,
  useQueryClient,
  toast,
} from '@vendure/dashboard';
import { Eye } from 'lucide-react';
import {
  approveProductReviewDocument,
  getProductReviewsDocument,
  rejectProductReviewDocument,
} from './reviews.graphql';

function ActionsCell({ review }: { review: { id: string; state: string } }) {
  const queryClient = useQueryClient();
  const state = review.state as 'new' | 'approved' | 'rejected';
  const canApprove = state === 'new' || state === 'rejected';
  const canReject = state !== 'rejected';

  const handleApprove = async () => {
    try {
      await api.mutate(approveProductReviewDocument)({
        id: review.id,
      });
      toast.success('Review approved');

      await queryClient.invalidateQueries();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve review';
      toast.error(message);
    }
  };

  const handleReject = async () => {
    try {
      await api.mutate(rejectProductReviewDocument)({
        id: review.id,
      });
      toast.success('Review rejected');

      await queryClient.invalidateQueries();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject review';
      toast.error(message);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="rounded border border-muted-foreground/40 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => {
          window.location.href = `/dashboard/reviews/${review.id}`;
        }}
      >
        <Eye className="h-3 w-3" />
      </button>
      <button
        type="button"
        className="rounded border border-emerald-600/60 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-600 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-emerald-700"
        disabled={!canApprove}
        onClick={handleApprove}
      >
        Approve
      </button>
      <button
        type="button"
        className="rounded border border-destructive/60 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-destructive"
        disabled={!canReject}
        onClick={handleReject}
      >
        Reject
      </button>
    </div>
  );
}

export const reviewsList: DashboardRouteDefinition = {
  navMenuItem: {
    sectionId: 'catalog',
    id: 'product-reviews',
    title: 'Reviews',
    requiresPermission: 'ReadCatalog',
  },
  path: '/reviews',
  loader: () => ({
    breadcrumb: 'Reviews',
  }),
  component: route => (
    <ListPage
      pageId="reviews-list"
      title="Product reviews"
      listQuery={getProductReviewsDocument}
      route={route}
      additionalColumns={{
        actions: {
          header: 'Actions',
          cell: ({ row }) => <ActionsCell review={row.original} />,
        },
      }}
      customizeColumns={{
        id: {
          cell: ({ row }) => {
            const review = row.original;
            return <DetailPageButton id={review.id} label={review.id} />;
          },
        },
        product: {
          header: 'Product',
          cell: ({ row }) => {
            const review = row.original;
            return (
              <div className="flex flex-col">
                <span className="font-medium">{review.product?.name ?? '—'}</span>
                <span className="text-xs text-muted-foreground">#{review.product?.id ?? '—'}</span>
              </div>
            );
          },
        },
        summary: {
          header: 'Summary',
          cell: ({ row }) => {
            const review = row.original;
            return <DetailPageButton id={review.id} label={review.summary} />;
          },
        },
        rating: {
          header: 'Rating',
          cell: ({ row }) => {
            const review = row.original;
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
                {review.rating.toFixed(1)} <span className="text-amber-500">★</span>
              </span>
            );
          },
        },
        authorName: {
          header: 'Author',
          cell: ({ row }) => {
            const review = row.original;
            return (
              <div className="flex flex-col">
                <span className="text-sm">{review.authorName}</span>
                {review.authorLocation ? (
                  <span className="text-xs text-muted-foreground">{review.authorLocation}</span>
                ) : null}
              </div>
            );
          },
        },
        state: {
          header: 'State',
          cell: ({ row }) => {
            const review = row.original;
            const value = review.state as 'new' | 'approved' | 'rejected';
            return (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  value === 'approved'
                    ? 'bg-emerald-500/10 text-emerald-700'
                    : value === 'rejected'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-blue-500/10 text-blue-700'
                }`}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </span>
            );
          },
        },
        createdAt: {
          header: 'Created',
          cell: ({ row }) => {
            const created = new Date(row.original.createdAt);
            return (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {created.toLocaleDateString()} {created.toLocaleTimeString()}
              </span>
            );
          },
        },
      }}
    />
  ),
};
