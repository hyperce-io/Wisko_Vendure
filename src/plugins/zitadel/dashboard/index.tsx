import { Button, defineDashboardExtension } from '@vendure/dashboard';
import { getApiBaseUrl } from '@/vdb/utils/config-utils.js';
import React from 'react';

// Staff sign in only on the Wisko sign-in page (ZITADEL): the login page sends them there at once, except after a
// refused sign-in. After the dashboard's own Log out, /wisko-auth/login ends the ZITADEL
// session too (see api/zitadel-auth.controller.ts).

const ERROR_MESSAGES: Record<string, string> = {
    'no-access': 'You do not have access to the Store. Ask your administrator.',
    failed: 'Signing in did not work. Try again in a moment.',
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
    const shouldRedirect = !errorCode;

    React.useEffect(() => {
        if (shouldRedirect) window.location.replace(signInUrl());
    }, [shouldRedirect]);

    if (shouldRedirect) {
        return <p className="text-center text-sm text-muted-foreground">Opening the Wisko sign-in page…</p>;
    }
    return (
        <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Wisko Store</h1>
            <p className="text-sm text-muted-foreground">
                {ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.failed}
            </p>
            <Button type="button" className="w-full" onClick={() => window.location.assign(signInUrl())}>
                Sign in with Wisko
            </Button>
            {errorCode === 'no-access' && (
                <Button type="button" variant="ghost" className="w-full" onClick={() => window.location.assign(wiskoAuthUrl('logout'))}>
                    Sign in as someone else
                </Button>
            )}
        </div>
    );
}

function WiskoLogo() {
    return (
        <div className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">W</span>
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
