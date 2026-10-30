import {
  api,
  DashboardFormComponent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useFormContext,
  useQuery,
} from '@vendure/dashboard';
import { getApprovedProductReviewsDocument } from './reviews.graphql';

// Radix Select does not allow an empty-string item value, so "no featured review" needs its own value.
const NO_REVIEW = '__none__';

export const FeaturedReviewSelector: DashboardFormComponent = ({ value, onChange, onBlur, name, disabled }) => {
  const { getValues } = useFormContext();
  const productId = getValues('id');

  const { data, isLoading } = useQuery({
    queryKey: ['approved-product-reviews', productId],
    queryFn: () => api.query(getApprovedProductReviewsDocument, { id: productId }),
    enabled: !!productId,
  });

  if (!productId) {
    return <p className="text-sm text-muted-foreground">Save the product before choosing a featured review.</p>;
  }

  const approvedReviews = data?.product?.reviews.items ?? [];

  return (
    <Select
      name={name}
      value={value ?? NO_REVIEW}
      onValueChange={selectedId => onChange(selectedId === NO_REVIEW ? null : selectedId)}
      onOpenChange={isOpen => !isOpen && onBlur()}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select an approved review" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_REVIEW}>No featured review</SelectItem>
        {approvedReviews.map(review => (
          <SelectItem key={review.id} value={review.id}>
            {review.rating.toFixed(1)} ★ — {review.summary} ({review.authorName})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
