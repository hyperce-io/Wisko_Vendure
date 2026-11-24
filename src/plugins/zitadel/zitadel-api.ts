// Read-only calls to ZITADEL with the service user's token (ZITADEL_SERVICE_TOKEN).
import { PLATFORM_ADMIN_ROLE } from './constants';
import { isRecord, parseRoleCatalog } from './role-sync/role-sync.payload';
import { VendureRoleCatalog, ZitadelPluginOptions } from './types';

const REQUEST_TIMEOUT_MS = 10000;
const DEPLOYED_CATALOG_PATH = '/management/v1/metadata/wisko_role_catalog';
const CLOSED_STATES = ['USER_STATE_INACTIVE', 'USER_STATE_LOCKED'];

const callZitadel = async (
    options: ZitadelPluginOptions,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    orgId?: string,
): Promise<Record<string, unknown>> => {
    const response = await fetch(`${options.issuer}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${options.serviceToken}`,
            'content-type': 'application/json',
            ...(orgId ? { 'x-zitadel-orgid': orgId } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const answer: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`ZITADEL ${method} ${path} answered ${response.status}`);
    return isRecord(answer) ? answer : {};
};

/** zitadel-init keeps the deployed catalog as base64 JSON in the platform organization's metadata. */
export const fetchDeployedCatalog = async (options: ZitadelPluginOptions): Promise<VendureRoleCatalog> => {
    const answer = await callZitadel(options, 'GET', DEPLOYED_CATALOG_PATH, undefined, options.platformOrgId);
    const metadata = isRecord(answer.metadata) ? answer.metadata : {};
    if (typeof metadata.value !== 'string') throw new Error('the platform organization has no wisko_role_catalog metadata');
    return parseRoleCatalog(JSON.parse(Buffer.from(metadata.value, 'base64').toString('utf8')));
};

/** The ZITADEL ids among `userIds` whose account is deactivated, locked or deleted. */
export const findClosedAccounts = async (options: ZitadelPluginOptions, userIds: string[]): Promise<Set<string>> => {
    const answer = await callZitadel(options, 'POST', '/v2/users', {
        query: { limit: userIds.length },
        queries: [{ inUserIdsQuery: { userIds } }],
    });
    const users = Array.isArray(answer.result) ? answer.result.filter(isRecord) : [];
    const openUserIds = new Set(
        users
            .filter(user => {
                const username = typeof user.username === 'string' ? user.username : '';
                return !CLOSED_STATES.includes(String(user.state)) && !username.includes('.removed-');
            })
            .map(user => String(user.userId)),
    );
    return new Set(userIds.filter(userId => !openUserIds.has(userId)));
};

/** Everyone the platform organization granted platform-admin on the Wisko project. */
export const findPlatformAdmins = async (options: ZitadelPluginOptions): Promise<Set<string>> => {
    const answer = await callZitadel(
        options,
        'POST',
        '/management/v1/users/grants/_search',
        {
            query: { limit: 1000 },
            queries: [{ projectIdQuery: { projectId: options.projectId } }, { roleKeyQuery: { roleKey: PLATFORM_ADMIN_ROLE } }],
        },
        options.platformOrgId,
    );
    const grants = Array.isArray(answer.result) ? answer.result.filter(isRecord) : [];
    return new Set(
        grants
            .filter(
                grant =>
                    grant.state !== 'USER_GRANT_STATE_INACTIVE' &&
                    Array.isArray(grant.roleKeys) &&
                    grant.roleKeys.includes(PLATFORM_ADMIN_ROLE),
            )
            .map(grant => String(grant.userId)),
    );
};
