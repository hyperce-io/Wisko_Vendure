// The OpenID Connect code flow with ZITADEL (state, nonce, PKCE) and the checks on the ID token it returns
// (signature from ZITADEL's published keys, issuer, audience, expiry, nonce). Same rules as wisko_strapi src/zitadel/oidc.ts.
import { createHash, createPublicKey, randomBytes, verify, webcrypto, type KeyObject } from 'node:crypto';

import { ACCESS_ROLE, CATALOG_APP_KEY, PLATFORM_ADMIN_ROLE, ROLES_CLAIM } from './constants';
import { PendingSignIn, ZitadelIdentity, ZitadelPluginOptions } from './types';

export class SignInRefused extends Error {}

const CLOCK_SKEW_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 10000;

const randomValue = () => randomBytes(32).toString('base64url');

export const startSignIn = (returnTo: string): PendingSignIn => ({
    state: randomValue(),
    nonce: randomValue(),
    codeVerifier: randomValue(),
    returnTo,
    startedAt: Date.now(),
});

export const authorizeUrl = (options: ZitadelPluginOptions, redirectUri: string, pending: PendingSignIn): string => {
    const query = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: [
            'openid email profile',
            'urn:zitadel:iam:org:projects:roles',
            'urn:zitadel:iam:user:metadata',
            `urn:zitadel:iam:org:project:id:${options.projectId}:aud`,
        ].join(' '),
        state: pending.state,
        nonce: pending.nonce,
        code_challenge: createHash('sha256').update(pending.codeVerifier).digest('base64url'),
        code_challenge_method: 'S256',
        max_age: String(options.sessionHours * 3600),
    });
    return `${options.issuer}/oauth/v2/authorize?${query}`;
};

export const endSessionUrl = (options: ZitadelPluginOptions, postLogoutRedirectUri: string): string =>
    `${options.issuer}/oidc/v1/end_session?${new URLSearchParams({
        client_id: options.clientId,
        post_logout_redirect_uri: postLogoutRedirectUri,
    })}`;

/** The ids of the organizations that granted `role`: ZITADEL's roles claim maps each role to them. */
const organizationsGranting = (rolesClaim: unknown, role: string): string[] => {
    if (!rolesClaim || typeof rolesClaim !== 'object') return [];
    const grants = Object.entries(rolesClaim).find(([key]) => key === role)?.[1];
    return grants && typeof grants === 'object' ? Object.keys(grants) : [];
};

export const finishSignIn = async (
    options: ZitadelPluginOptions,
    redirectUri: string,
    pending: PendingSignIn,
    code: string,
): Promise<ZitadelIdentity> => {
    const response = await fetch(`${options.issuer}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: options.clientId,
            client_secret: options.clientSecret,
            code_verifier: pending.codeVerifier,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const tokens: unknown = await response.json().catch(() => null);
    const idToken = tokens && typeof tokens === 'object' && 'id_token' in tokens ? tokens.id_token : undefined;
    if (!response.ok || typeof idToken !== 'string') {
        throw new Error(`ZITADEL refused the sign-in code (${response.status})`);
    }

    const claims = await verifiedClaims(options, idToken);
    if (claims.nonce !== pending.nonce) throw new Error('ID token nonce does not match this sign-in');
    if (typeof claims.email !== 'string' || !claims.email) throw new SignInRefused('Your Wisko account has no email address.');
    if (typeof claims.auth_time !== 'number') throw new Error('ID token has no auth_time');
    if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('ID token has no sub');

    const rolesClaim = claims[ROLES_CLAIM];
    return {
        zitadelUserId: claims.sub,
        email: claims.email.toLowerCase(),
        firstName: typeof claims.given_name === 'string' ? claims.given_name : '',
        lastName: typeof claims.family_name === 'string' ? claims.family_name : '',
        isPlatformAdmin: organizationsGranting(rolesClaim, PLATFORM_ADMIN_ROLE).includes(options.platformOrgId),
        hasStoreAccess: organizationsGranting(rolesClaim, `${CATALOG_APP_KEY}.${ACCESS_ROLE}`).length > 0,
        signedInAt: new Date(claims.auth_time * 1000),
    };
};

// ---- ID token check ----

const signingKeys = new Map<string, KeyObject>();

const loadSigningKeys = async (options: ZitadelPluginOptions): Promise<void> => {
    const response = await fetch(`${options.issuer}/oauth/v2/keys`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`ZITADEL keys unavailable (${response.status})`);
    const { keys }: { keys: Array<webcrypto.JsonWebKey & { kid?: string }> } = await response.json();
    signingKeys.clear();
    for (const key of keys) {
        if (key.kid && key.use !== 'enc') signingKeys.set(key.kid, createPublicKey({ key, format: 'jwk' }));
    }
};

const decodePart = (part: string): Record<string, unknown> => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

const verifiedClaims = async (options: ZitadelPluginOptions, idToken: string): Promise<Record<string, unknown>> => {
    const [headerPart, payloadPart, signaturePart] = idToken.split('.');
    if (!headerPart || !payloadPart || !signaturePart) throw new Error('ID token is malformed');
    const header = decodePart(headerPart);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
        throw new Error(`ID token algorithm ${String(header.alg)} is not accepted`);
    }

    // ZITADEL rotates its keys: an unknown key id means the cached set is old.
    if (!signingKeys.has(header.kid)) await loadSigningKeys(options);
    const key = signingKeys.get(header.kid);
    if (!key) throw new Error('ID token is signed with an unknown key');
    const isSignatureValid = verify(
        'RSA-SHA256',
        Buffer.from(`${headerPart}.${payloadPart}`),
        key,
        Buffer.from(signaturePart, 'base64url'),
    );
    if (!isSignatureValid) throw new Error('ID token signature is invalid');

    const claims = decodePart(payloadPart);
    const now = Math.floor(Date.now() / 1000);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== options.issuer) throw new Error('ID token issuer does not match');
    if (!audience.includes(options.clientId)) throw new Error('ID token is not for this app');
    if (claims.azp !== undefined && claims.azp !== options.clientId) throw new Error('ID token was issued to another app');
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < now) throw new Error('ID token has expired');
    if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_SECONDS > now) throw new Error('ID token is issued in the future');
    return claims;
};
