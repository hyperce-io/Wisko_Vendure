import { defineDashboardExtension } from '@vendure/dashboard';

import { FeaturedReviewSelector } from './featured-review-selector';
import { reviewsList } from './reviews-list';
import { reviewDetail } from './review-detail';

export default defineDashboardExtension({
  routes: [reviewsList, reviewDetail],
  customFormComponents: {
    customFields: [{ id: 'featured-review-selector', component: FeaturedReviewSelector }],
  },
});
