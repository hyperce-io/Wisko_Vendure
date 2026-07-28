import { defineDashboardExtension } from '@vendure/dashboard';
import React, { useState, useEffect } from 'react';

interface TenantChannel {
    id: string;
    code: string;
    token: string;
    defaultCurrencyCode: string;
    defaultLanguageCode: string;
    pricesIncludeTax: boolean;
}

interface TenantAdmin {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
}

interface TenantData {
    id: string;
    code: string;
    name: string;
    enabled: boolean;
    maxChannels: number;
    parentRoleId: string;
    channels: TenantChannel[];
    administrators: TenantAdmin[];
}

async function gqlFetch(query: string, variables?: any) {
    const apiUrl = window.location.port === '5173'
        ? 'http://localhost:3000/admin-api'
        : '/admin-api';
    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query, variables }),
    });
    return res.json();
}

function StatusBadge({ enabled }: { enabled: boolean }) {
    return (
        <span
            style={{
                display: 'inline-block',
                padding: '2px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 600,
                background: enabled ? '#dcfce7' : '#fee2e2',
                color: enabled ? '#16a34a' : '#dc2626',
            }}
        >
            {enabled ? 'Active' : 'Suspended'}
        </span>
    );
}

function TenantListPage() {
    const [tenants, setTenants] = useState<TenantData[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const fetchTenants = async () => {
        setLoading(true);
        try {
            const json = await gqlFetch(`query {
                tenants {
                    items {
                        id code name enabled maxChannels parentRoleId
                        channels { id code token defaultCurrencyCode defaultLanguageCode pricesIncludeTax }
                        administrators { id firstName lastName emailAddress }
                    }
                    totalItems
                }
            }`);
            if (json.errors) {
                setError(json.errors[0]?.message || 'Failed to fetch');
            } else {
                setTenants(json.data.tenants.items);
                setTotalItems(json.data.tenants.totalItems);
            }
        } catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    };

    const toggleEnabled = async (t: TenantData) => {
        await gqlFetch(
            `mutation($input: UpdateTenantInput!) { updateTenant(input: $input) { id } }`,
            { input: { id: t.id, enabled: !t.enabled } },
        );
        fetchTenants();
    };

    useEffect(() => {
        fetchTenants();
    }, []);

    const toggle = (id: string) => setExpandedId(expandedId === id ? null : id);

    const active = tenants.filter((t) => t.enabled).length;
    const suspended = tenants.filter((t) => !t.enabled).length;
    const totalChannels = tenants.reduce((sum, t) => sum + t.channels.length, 0);
    const totalAdmins = tenants.reduce((sum, t) => sum + t.administrators.length, 0);

    const stats = [
        { label: 'Total Tenants', value: totalItems, bg: '#f8f9fa', color: '#111' },
        { label: 'Active', value: active, bg: '#f0fdf4', color: '#16a34a' },
        { label: 'Suspended', value: suspended, bg: '#fef2f2', color: '#dc2626' },
        { label: 'Total Channels', value: totalChannels, bg: '#eff6ff', color: '#2563eb' },
        { label: 'Total Admins', value: totalAdmins, bg: '#faf5ff', color: '#7c3aed' },
    ];

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0' }}>Tenants</h1>
            <p style={{ color: '#666', margin: '0 0 24px 0', fontSize: '14px' }}>
                Manage your multi-tenant organizations, their channels and administrators.
            </p>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
                {stats.map((s) => (
                    <div key={s.label} style={{ padding: '14px 22px', background: s.bg, borderRadius: '8px', minWidth: '120px' }}>
                        <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                            {s.label}
                        </div>
                        <div style={{ fontSize: '26px', fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Loading...</div>
                ) : error ? (
                    <div style={{ padding: '20px', color: '#dc2626' }}>Error: {error}</div>
                ) : tenants.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>No tenants yet.</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                <th style={th}></th>
                                <th style={th}>Code</th>
                                <th style={th}>Name</th>
                                <th style={th}>Status</th>
                                <th style={th}>Channels</th>
                                <th style={th}>Admins</th>
                                <th style={th}>Max</th>
                                <th style={th}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tenants.map((t) => (
                                <React.Fragment key={t.id}>
                                    <tr
                                        style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                                        onClick={() => toggle(t.id)}
                                    >
                                        <td style={td}>
                                            <span
                                                style={{
                                                    fontSize: '12px',
                                                    color: '#999',
                                                    display: 'inline-block',
                                                    transform: expandedId === t.id ? 'rotate(90deg)' : 'rotate(0deg)',
                                                    transition: 'transform 0.2s',
                                                }}
                                            >
                                                &#9654;
                                            </span>
                                        </td>
                                        <td style={td}>
                                            <code style={codeSt}>{t.code}</code>
                                        </td>
                                        <td style={{ ...td, fontWeight: 500 }}>{t.name}</td>
                                        <td style={td}>
                                            <StatusBadge enabled={t.enabled} />
                                        </td>
                                        <td style={td}>
                                            <span style={{ fontWeight: 600 }}>{t.channels.length}</span>
                                            <span style={{ color: '#999', marginLeft: '4px' }}>/ {t.maxChannels}</span>
                                        </td>
                                        <td style={td}>{t.administrators.length}</td>
                                        <td style={td}>{t.maxChannels}</td>
                                        <td style={td} onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => toggleEnabled(t)}
                                                style={{
                                                    padding: '4px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    background: t.enabled ? '#fef2f2' : '#f0fdf4',
                                                    color: t.enabled ? '#dc2626' : '#16a34a',
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                    fontWeight: 500,
                                                }}
                                            >
                                                {t.enabled ? 'Suspend' : 'Activate'}
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedId === t.id && (
                                        <tr>
                                            <td colSpan={8} style={{ padding: '0 16px 16px 40px', background: '#fafbfc' }}>
                                                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', paddingTop: '12px' }}>
                                                    <div style={card}>
                                                        <div style={cardTitleSt}>Channels ({t.channels.length})</div>
                                                        {t.channels.length === 0 ? (
                                                            <div style={{ color: '#999', fontSize: '13px' }}>No channels</div>
                                                        ) : (
                                                            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                                        <th style={sTh}>Code</th>
                                                                        <th style={sTh}>Currency</th>
                                                                        <th style={sTh}>Language</th>
                                                                        <th style={sTh}>Tax incl.</th>
                                                                        <th style={sTh}>Token</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {t.channels.map((ch) => (
                                                                        <tr key={ch.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                                            <td style={sTd}>
                                                                                <code style={codeSt}>{ch.code}</code>
                                                                            </td>
                                                                            <td style={sTd}>
                                                                                <span style={tag}>{ch.defaultCurrencyCode}</span>
                                                                            </td>
                                                                            <td style={sTd}>{ch.defaultLanguageCode}</td>
                                                                            <td style={sTd}>{ch.pricesIncludeTax ? 'Yes' : 'No'}</td>
                                                                            <td style={sTd}>
                                                                                <code style={{ fontSize: '11px', color: '#999' }}>{ch.token}</code>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        )}
                                                    </div>
                                                    <div style={card}>
                                                        <div style={cardTitleSt}>Administrators ({t.administrators.length})</div>
                                                        {t.administrators.length === 0 ? (
                                                            <div style={{ color: '#999', fontSize: '13px' }}>
                                                                No admins (ERP-provisioned tenant)
                                                            </div>
                                                        ) : (
                                                            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                                        <th style={sTh}>Name</th>
                                                                        <th style={sTh}>Email</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {t.administrators.map((a) => (
                                                                        <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                                            <td style={sTd}>
                                                                                {a.firstName} {a.lastName}
                                                                            </td>
                                                                            <td style={sTd}>
                                                                                <code style={{ fontSize: '12px' }}>{a.emailAddress}</code>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.3px', color: '#666' };
const td: React.CSSProperties = { padding: '12px' };
const sTh: React.CSSProperties = { padding: '6px 10px', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', color: '#888', textAlign: 'left' };
const sTd: React.CSSProperties = { padding: '6px 10px' };
const codeSt: React.CSSProperties = { background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px', fontSize: '13px' };
const tag: React.CSSProperties = { background: '#eff6ff', color: '#2563eb', padding: '1px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 500 };
const card: React.CSSProperties = { flex: '1 1 300px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', minWidth: '300px' };
const cardTitleSt: React.CSSProperties = { fontWeight: 600, fontSize: '14px', marginBottom: '12px', color: '#333' };

defineDashboardExtension({
    routes: [
        {
            path: '/tenants',
            loader: () => ({ breadcrumb: 'Tenants' }),
            navMenuItem: { id: 'tenants', title: 'Tenants', sectionId: 'settings' },
            component: TenantListPage,
        },
    ],
});
