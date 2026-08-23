import {
    defineDashboardExtension,
    api,
    useQuery,
    useMutation,
    useQueryClient,
    Card,
    Badge,
    Button,
    toast,
    Page,
    PageBlock,
    PageLayout,
} from '@vendure/dashboard';
import { graphql } from '@/gql';
import React from 'react';

// ---- GraphQL Documents ----

const getCompaniesQuery = graphql(`
    query GetCompanies {
        companies {
            items {
                id
                code
                name
                enabled
                parentRoleId
                tenants {
                    id
                    code
                    name
                    enabled
                    maxChannels
                    parentRoleId
                    channels {
                        id
                        code
                        token
                        defaultCurrencyCode
                        defaultLanguageCode
                        pricesIncludeTax
                    }
                    administrators {
                        id
                        firstName
                        lastName
                        emailAddress
                    }
                }
                channels {
                    id
                    code
                    defaultCurrencyCode
                }
                administrators {
                    id
                    firstName
                    lastName
                    emailAddress
                }
            }
            totalItems
        }
    }
`);

const updateCompanyMutation = graphql(`
    mutation UpdateCompany($input: UpdateCompanyInput!) {
        updateCompany(input: $input) {
            id
            enabled
        }
    }
`);

const updateTenantMutation = graphql(`
    mutation UpdateTenant($input: UpdateTenantInput!) {
        updateTenant(input: $input) {
            id
            enabled
        }
    }
`);

// ---- Main Page ----

function OrganizationsPage() {
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery({
        queryKey: ['companies'],
        queryFn: () => api.query(getCompaniesQuery),
    });

    const toggleCompany = useMutation({
        mutationFn: (input: { id: string; enabled: boolean }) =>
            api.mutate(updateCompanyMutation, { input }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['companies'] });
            toast.success('Company updated');
        },
        onError: (err: any) => toast.error(err.message),
    });

    const toggleTenant = useMutation({
        mutationFn: (input: { id: string; enabled: boolean }) =>
            api.mutate(updateTenantMutation, { input }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['companies'] });
            toast.success('Tenant updated');
        },
        onError: (err: any) => toast.error(err.message),
    });

    const companies = data?.companies?.items ?? [];
    const totalCompanies = companies.length;
    const totalTenants = companies.reduce((s, c) => s + (c.tenants?.length ?? 0), 0);
    const totalChannels = companies.reduce((s, c) => s + (c.channels?.length ?? 0), 0);
    const activeCompanies = companies.filter(c => c.enabled).length;

    const [expandedCompany, setExpandedCompany] = React.useState<string | null>(null);
    const [expandedTenant, setExpandedTenant] = React.useState<string | null>(null);

    if (isLoading) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold mb-2">Organizations</h1>
                <p className="text-muted-foreground">Loading...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold mb-2">Organizations</h1>
                <p className="text-destructive">Error: {error.message}</p>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-[1400px] mx-auto">
            <h1 className="text-2xl font-bold mb-1">Organizations</h1>
            <p className="text-muted-foreground text-sm mb-5">Company → Tenant → Channel hierarchy</p>

            {/* Stats */}
            <div className="flex gap-3 flex-wrap mb-5">
                <StatCard label="Companies" value={totalCompanies} />
                <StatCard label="Active" value={activeCompanies} variant="success" />
                <StatCard label="Tenants" value={totalTenants} variant="info" />
                <StatCard label="Channels" value={totalChannels} variant="purple" />
            </div>

            {/* Company list */}
            <Card className="overflow-hidden">
                {companies.length === 0 ? (
                    <div className="p-10 text-center text-muted-foreground">
                        No companies yet. Send events via RabbitMQ to create.
                    </div>
                ) : (
                    <div className="divide-y">
                        {companies.map(company => (
                            <div key={company.id}>
                                {/* Company Row */}
                                <div
                                    className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-muted/50 transition-colors"
                                    onClick={() => setExpandedCompany(expandedCompany === company.id ? null : company.id)}
                                >
                                    <span className={`text-xs text-muted-foreground transition-transform ${expandedCompany === company.id ? 'rotate-90' : ''}`}>
                                        &#9654;
                                    </span>
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 text-[10px]">COMPANY</Badge>
                                    <code className="bg-muted px-2 py-0.5 rounded text-xs">{company.code}</code>
                                    <span className="font-semibold">{company.name}</span>
                                    <Badge variant={company.enabled ? 'default' : 'destructive'} className="text-[10px]">
                                        {company.enabled ? 'Active' : 'Suspended'}
                                    </Badge>
                                    <span className="text-muted-foreground text-xs">{company.tenants?.length ?? 0} tenants</span>
                                    <span className="text-muted-foreground text-xs">{company.channels?.length ?? 0} channels</span>
                                    <div className="ml-auto" onClick={e => e.stopPropagation()}>
                                        <Button
                                            size="sm"
                                            variant={company.enabled ? 'destructive' : 'default'}
                                            onClick={() => toggleCompany.mutate({ id: company.id, enabled: !company.enabled })}
                                        >
                                            {company.enabled ? 'Suspend' : 'Activate'}
                                        </Button>
                                    </div>
                                </div>

                                {/* Expanded: Company details */}
                                {expandedCompany === company.id && (
                                    <div className="pl-10 bg-muted/30 pb-2">
                                        {/* Company admins */}
                                        {(company.administrators?.length ?? 0) > 0 && (
                                            <div className="flex items-center gap-2 py-2 text-xs border-b border-border/50">
                                                <span className="font-semibold text-muted-foreground">ADMINS:</span>
                                                {company.administrators?.map(a => (
                                                    <Badge key={a.id} variant="secondary" className="text-[11px]">
                                                        {a.firstName} {a.lastName} ({a.emailAddress})
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}

                                        {/* Tenants */}
                                        {(company.tenants?.length ?? 0) === 0 ? (
                                            <p className="text-muted-foreground text-sm py-3">No tenants</p>
                                        ) : (
                                            company.tenants?.map(tenant => (
                                                <div key={tenant.id} className="border-b border-border/30 last:border-0">
                                                    {/* Tenant Row */}
                                                    <div
                                                        className="flex items-center gap-2.5 py-3 pr-5 cursor-pointer hover:bg-muted/30 transition-colors"
                                                        onClick={() => setExpandedTenant(expandedTenant === tenant.id ? null : tenant.id)}
                                                    >
                                                        <span className={`text-[10px] text-muted-foreground transition-transform ${expandedTenant === tenant.id ? 'rotate-90' : ''}`}>
                                                            &#9654;
                                                        </span>
                                                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 text-[10px]">TENANT</Badge>
                                                        <code className="bg-muted px-2 py-0.5 rounded text-xs">{tenant.code}</code>
                                                        <span className="font-medium text-sm">{tenant.name}</span>
                                                        <Badge variant={tenant.enabled ? 'default' : 'destructive'} className="text-[10px]">
                                                            {tenant.enabled ? 'Active' : 'Suspended'}
                                                        </Badge>
                                                        <span className="text-muted-foreground text-xs">{tenant.channels?.length ?? 0} ch</span>
                                                        <span className="text-muted-foreground text-xs">{tenant.administrators?.length ?? 0} admins</span>
                                                        <div className="ml-auto" onClick={e => e.stopPropagation()}>
                                                            <Button
                                                                size="sm"
                                                                variant={tenant.enabled ? 'destructive' : 'default'}
                                                                onClick={() => toggleTenant.mutate({ id: tenant.id, enabled: !tenant.enabled })}
                                                            >
                                                                {tenant.enabled ? 'Suspend' : 'Activate'}
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {/* Expanded: Tenant details */}
                                                    {expandedTenant === tenant.id && (
                                                        <div className="pl-8 pb-3">
                                                            {/* Tenant admins */}
                                                            {(tenant.administrators?.length ?? 0) > 0 && (
                                                                <div className="flex items-center gap-2 py-2 text-xs">
                                                                    <span className="font-semibold text-muted-foreground">Admins:</span>
                                                                    {tenant.administrators?.map(a => (
                                                                        <Badge key={a.id} variant="secondary" className="text-[11px]">
                                                                            {a.firstName} {a.lastName} ({a.emailAddress})
                                                                        </Badge>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Channels table */}
                                                            {(tenant.channels?.length ?? 0) === 0 ? (
                                                                <p className="text-muted-foreground text-xs py-2">No channels</p>
                                                            ) : (
                                                                <table className="w-full text-xs mt-1">
                                                                    <thead>
                                                                        <tr className="border-b text-left">
                                                                            <th className="px-2 py-1.5 font-semibold text-muted-foreground uppercase text-[10px]">Channel</th>
                                                                            <th className="px-2 py-1.5 font-semibold text-muted-foreground uppercase text-[10px]">Currency</th>
                                                                            <th className="px-2 py-1.5 font-semibold text-muted-foreground uppercase text-[10px]">Language</th>
                                                                            <th className="px-2 py-1.5 font-semibold text-muted-foreground uppercase text-[10px]">Tax incl.</th>
                                                                            <th className="px-2 py-1.5 font-semibold text-muted-foreground uppercase text-[10px]">Token</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {tenant.channels?.map(ch => (
                                                                            <tr key={ch.id} className="border-b border-border/30">
                                                                                <td className="px-2 py-1.5">
                                                                                    <Badge variant="outline" className="bg-amber-50 text-amber-800 text-[10px] mr-1">CH</Badge>
                                                                                    <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">{ch.code}</code>
                                                                                </td>
                                                                                <td className="px-2 py-1.5">
                                                                                    <Badge variant="outline" className="text-[10px]">{ch.defaultCurrencyCode}</Badge>
                                                                                </td>
                                                                                <td className="px-2 py-1.5">{ch.defaultLanguageCode}</td>
                                                                                <td className="px-2 py-1.5">{ch.pricesIncludeTax ? 'Yes' : 'No'}</td>
                                                                                <td className="px-2 py-1.5 text-muted-foreground">
                                                                                    <code className="text-[10px]">{ch.token}</code>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}

// ---- Stat Card ----

function StatCard({ label, value, variant = 'default' }: { label: string; value: number; variant?: string }) {
    const colors: Record<string, string> = {
        default: 'bg-muted',
        success: 'bg-green-50 text-green-700',
        info: 'bg-blue-50 text-blue-700',
        purple: 'bg-purple-50 text-purple-700',
    };
    return (
        <div className={`px-5 py-3 rounded-lg min-w-[110px] ${colors[variant] || colors.default}`}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
            <div className="text-2xl font-bold">{value}</div>
        </div>
    );
}

// ---- Register Extension ----

defineDashboardExtension({
    routes: [{
        path: '/organizations',
        loader: () => ({ breadcrumb: 'Organizations' }),
        navMenuItem: { id: 'organizations', title: 'Organizations', sectionId: 'settings' },
        component: OrganizationsPage,
    }],
});
