import { defineDashboardExtension, Page, PageBlock, PageLayout, PageTitle } from '@vendure/dashboard';

defineDashboardExtension({
    routes: [
        {
            path: '/tenants',
            loader: () => ({ breadcrumb: 'Tenants' }),
            navMenuItem: {
                id: 'tenants',
                title: 'Tenants',
                sectionId: 'settings',
            },
            component: () => {
                return (
                    <Page pageId="tenants-list">
                        <PageTitle>Tenants</PageTitle>
                        <PageLayout>
                            <PageBlock column="main" blockId="tenant-list">
                                <p>Use the Admin API to manage tenants.</p>
                                <p>
                                    <code>createTenant</code> mutation to onboard a new organization.
                                </p>
                                <p>
                                    <code>tenants</code> query to list all organizations.
                                </p>
                            </PageBlock>
                        </PageLayout>
                    </Page>
                );
            },
        },
    ],
});
