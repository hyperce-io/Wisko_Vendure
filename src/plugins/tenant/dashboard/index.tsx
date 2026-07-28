import {
    defineDashboardExtension,
    Page,
    PageBlock,
    PageLayout,
    PageTitle,
    Button,
    Card,
    Badge,
} from '@vendure/dashboard';
import { graphql } from '@/gql';
import { useState, useEffect } from 'react';

// ---- GraphQL Documents ----

const GET_TENANTS = graphql(`
    query GetTenants {
        tenants {
            items {
                id
                code
                name
                enabled
                maxChannels
                parentRoleId
            }
            totalItems
        }
    }
`);

const UPDATE_TENANT = graphql(`
    mutation UpdateTenant($input: UpdateTenantInput!) {
        updateTenant(input: $input) {
            id
            name
            enabled
            maxChannels
        }
    }
`);

// ---- Tenant List Page Component ----

function TenantListPage() {
    const [tenants, setTenants] = useState<any[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTenants = async () => {
        setLoading(true);
        try {
            const res = await fetch('/admin-api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    query: `query {
                        tenants {
                            items { id code name enabled maxChannels parentRoleId }
                            totalItems
                        }
                    }`,
                }),
            });
            const json = await res.json();
            if (json.errors) {
                setError(json.errors[0]?.message || 'Failed to fetch tenants');
            } else {
                setTenants(json.data.tenants.items);
                setTotalItems(json.data.tenants.totalItems);
            }
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    };

    const toggleEnabled = async (tenant: any) => {
        try {
            await fetch('/admin-api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    query: `mutation UpdateTenant($input: UpdateTenantInput!) {
                        updateTenant(input: $input) { id enabled }
                    }`,
                    variables: { input: { id: tenant.id, enabled: !tenant.enabled } },
                }),
            });
            fetchTenants();
        } catch (err: any) {
            setError(err.message);
        }
    };

    useEffect(() => {
        fetchTenants();
    }, []);

    return (
        <Page pageId="tenants-list">
            <PageTitle>Tenants</PageTitle>
            <PageLayout>
                <PageBlock column="full" blockId="tenant-stats">
                    <div style={{ display: 'flex', gap: '24px', marginBottom: '8px' }}>
                        <div style={{ padding: '16px 24px', background: '#f8f9fa', borderRadius: '8px', minWidth: '140px' }}>
                            <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Tenants</div>
                            <div style={{ fontSize: '28px', fontWeight: 700 }}>{totalItems}</div>
                        </div>
                        <div style={{ padding: '16px 24px', background: '#f0fdf4', borderRadius: '8px', minWidth: '140px' }}>
                            <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active</div>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: '#16a34a' }}>
                                {tenants.filter(t => t.enabled).length}
                            </div>
                        </div>
                        <div style={{ padding: '16px 24px', background: '#fef2f2', borderRadius: '8px', minWidth: '140px' }}>
                            <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Suspended</div>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: '#dc2626' }}>
                                {tenants.filter(t => !t.enabled).length}
                            </div>
                        </div>
                    </div>
                </PageBlock>

                <PageBlock column="full" blockId="tenant-table">
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Loading tenants...</div>
                    ) : error ? (
                        <div style={{ padding: '20px', color: '#dc2626' }}>Error: {error}</div>
                    ) : tenants.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                            No tenants yet. Use the <code>createTenant</code> mutation in the Admin API to create one.
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Code</th>
                                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
                                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Max Channels</th>
                                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Role ID</th>
                                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tenants.map(tenant => (
                                    <tr key={tenant.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '12px 16px' }}>
                                            <code style={{
                                                background: '#f3f4f6',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '13px',
                                            }}>{tenant.code}</code>
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 500 }}>{tenant.name}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '2px 10px',
                                                borderRadius: '12px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                background: tenant.enabled ? '#dcfce7' : '#fee2e2',
                                                color: tenant.enabled ? '#16a34a' : '#dc2626',
                                            }}>
                                                {tenant.enabled ? 'Active' : 'Suspended'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>{tenant.maxChannels}</td>
                                        <td style={{ padding: '12px 16px', color: '#999' }}>{tenant.parentRoleId}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <button
                                                onClick={() => toggleEnabled(tenant)}
                                                style={{
                                                    padding: '4px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    background: tenant.enabled ? '#fef2f2' : '#f0fdf4',
                                                    color: tenant.enabled ? '#dc2626' : '#16a34a',
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                    fontWeight: 500,
                                                }}
                                            >
                                                {tenant.enabled ? 'Suspend' : 'Activate'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </PageBlock>
            </PageLayout>
        </Page>
    );
}

// ---- Register Extension ----

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
            component: TenantListPage,
        },
    ],
});
