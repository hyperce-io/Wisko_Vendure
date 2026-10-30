import { defineDashboardExtension } from '@vendure/dashboard';
import { MessageCircleQuestion } from 'lucide-react';
import { faqList } from './faq-list';
import { faqDetail } from './faq-detail';
import { DeleteFaqBulkAction } from './components/faq-bulk-actions';
import { CollectionFaqsSection } from './components/collection-faqs-section';
import { ProductFaqsSection } from './components/product-faqs-section';

defineDashboardExtension({
  navSections: [
    {
      id: 'help-and-support',
      title: 'Help & Support',
      icon: MessageCircleQuestion,
      order: 550,
    },
  ],
  routes: [faqList, faqDetail],
  dataTables: [
    {
      pageId: 'faq-list',
      bulkActions: [
        {
          order: 100,
          component: DeleteFaqBulkAction,
        },
      ],
    },
  ],
  pageBlocks: [
    {
      id: 'product-faqs',
      title: 'FAQs',
      location: {
        // Real product-detail main-column blockIds are `main-form`,
        // `product-variants-table`, `generate-variants`. Anchor below the
        // variants table so FAQs read as "additional product content".
        //
        // NOTE: `column: 'main'` (not 'full') is required for the anchor to
        // actually place the block *after* the variants table. The layout
        // engine (see @vendure/dashboard page-layout.tsx) buckets blocks by
        // column and renders full-width blocks first, so a `column: 'full'`
        // block would always appear at the very top of the page regardless
        // of the `position.blockId` anchor.
        pageId: 'product-detail',
        column: 'main',
        position: {
          blockId: 'product-variants-table',
          order: 'after',
        },
      },
      component: ProductFaqsSection,
    },
    {
      id: 'collection-faqs',
      title: 'FAQs',
      location: {
        pageId: 'collection-detail',
        column: 'main',
        position: {
          blockId: 'contents',
          order: 'after',
        },
      },
      component: CollectionFaqsSection,
    },
  ],
});
