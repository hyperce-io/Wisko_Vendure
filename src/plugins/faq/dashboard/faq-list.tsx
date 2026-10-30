import { Button, DashboardRouteDefinition, ListPage, PageActionBarRight } from '@vendure/dashboard';
import { Link } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';

import { getFaqListQuery } from './faq.graphql';
import { faqCustomizeColumns, faqDefaultVisibility } from './components/faq-columns';

export const faqList: DashboardRouteDefinition = {
  navMenuItem: {
    sectionId: 'help-and-support',
    id: 'faq-list',
    url: '/faq',
    title: 'FAQs',
    requiresPermission: 'ReadFaq',
  },
  path: '/faq',
  loader: () => ({
    breadcrumb: 'FAQs',
  }),
  component: route => (
    <ListPage
      pageId="faq-list"
      title="FAQs"
      listQuery={getFaqListQuery}
      route={route}
      defaultVisibility={faqDefaultVisibility}
      transformVariables={variables => {
        return {
          options: {
            ...variables.options,
            filterOperator: 'OR',
          },
        };
      }}
      onSearchTermChange={searchTerm => {
        return {
          question: {
            contains: searchTerm,
          },
          answer: {
            contains: searchTerm,
          },
        };
      }}
      // Relative navigation: `./42` resolves to `/faq/42`.
      customizeColumns={faqCustomizeColumns(id => `./${id}`)}
    >
      <PageActionBarRight>
        <Button render={<Link to="./new" />}>
          <PlusIcon className="mr-2 h-4 w-4" />
          New FAQ
        </Button>
      </PageActionBarRight>
    </ListPage>
  ),
};
