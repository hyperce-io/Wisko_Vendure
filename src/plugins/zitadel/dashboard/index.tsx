import { Button, defineDashboardExtension } from '@vendure/dashboard';
import { getApiBaseUrl } from '@/vdb/utils/config-utils.js';
import React from 'react';

// Staff sign in on the Wisko sign-in page (ZITADEL): the login page sends them there at once, except after a refused
// sign-in or with ?password=1, which shows Vendure's own email and password form. After the dashboard's own Log out,
// /wisko-auth/login ends the ZITADEL session too (see api/zitadel-auth.controller.ts). A refused sign-in shows the same
// "Not authorized" card as the ERP.

const PASSWORD_QUERY = 'password';

// The Wisko brand colour, as in the ERP and the Wisko sign-in page.
const WISKO_GREEN = '#1f9d55';
// Vendure's email and password form, hidden under the Wisko card until someone asks for it.
const HIDE_PASSWORD_FORM = 'form:has([data-wisko-sign-in]) > :not(:has([data-wisko-sign-in])) { display: none; }';

const REFUSALS: Record<string, { title: string; message: string }> = {
    'no-access': { title: 'Not authorized', message: "You don't have access to the Store with this Wisko account." },
    failed: { title: 'Signing in did not work', message: 'Please try again in a moment.' },
};

const wiskoAuthUrl = (route: 'login' | 'logout', query?: URLSearchParams) =>
    `${getApiBaseUrl()}/wisko-auth/${route}${query ? `?${query}` : ''}`;

const signInUrl = () => {
    const dashboardPath = window.location.pathname.replace(/\/login\/?$/, '');
    const wantedPath = new URLSearchParams(window.location.search).get('redirect') || '/';
    return wiskoAuthUrl('login', new URLSearchParams({ returnTo: `${dashboardPath}${wantedPath}` }));
};

function WiskoSignIn() {
    const [search] = React.useState(() => new URLSearchParams(window.location.search));
    const errorCode = search.get('error');
    const [showsPasswordForm, setShowsPasswordForm] = React.useState(() => search.has(PASSWORD_QUERY));
    const shouldRedirect = !errorCode && !showsPasswordForm;

    React.useEffect(() => {
        if (shouldRedirect) window.location.replace(signInUrl());
    }, [shouldRedirect]);

    const refusal = REFUSALS[errorCode ?? ''] ?? REFUSALS.failed;
    return (
        <div data-wisko-sign-in className="flex flex-col items-center gap-2 py-2 text-center">
            {!showsPasswordForm && <style>{HIDE_PASSWORD_FORM}</style>}
            {showsPasswordForm ? (
                <div className="flex flex-col items-center gap-2">
                    <h1 className="text-lg font-semibold">Sign in with email and password</h1>
                    <Button type="button" variant="link" onClick={() => window.location.assign(signInUrl())}>
                        Sign in with Wisko instead
                    </Button>
                </div>
            ) : shouldRedirect ? (
                <p className="text-sm text-muted-foreground">Opening the Wisko sign-in page…</p>
            ) : (
                <>
                    <h1 className="text-lg font-semibold">{refusal.title}</h1>
                    <p className="text-sm text-muted-foreground">{refusal.message}</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-3">
                        {errorCode !== 'no-access' && (
                            <Button type="button" variant="outline" onClick={() => window.location.assign(signInUrl())}>
                                Try again
                            </Button>
                        )}
                        <Button
                            type="button"
                            style={{ backgroundColor: WISKO_GREEN, color: '#ffffff' }}
                            onClick={() => window.location.assign(wiskoAuthUrl('logout'))}
                        >
                            Sign in as someone else
                        </Button>
                    </div>
                    <Button type="button" variant="link" className="text-muted-foreground" onClick={() => setShowsPasswordForm(true)}>
                        Sign in with email and password
                    </Button>
                </>
            )}
        </div>
    );
}

function WiskoLogo() {
    return (
        <div className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
            <span
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: WISKO_GREEN }}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-5 w-5" aria-hidden="true">
                    <path d="M5 5l14 14M19 5L5 19" strokeLinecap="round" />
                    <path d="M12 2v6M12 16v6" strokeLinecap="round" opacity="0.55" />
                </svg>
            </span>
            Wisko
        </div>
    );
}

defineDashboardExtension({
    login: {
        logo: { component: WiskoLogo },
        beforeForm: { component: WiskoSignIn },
    },
});
