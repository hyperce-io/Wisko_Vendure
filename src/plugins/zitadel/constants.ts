export const ZITADEL_PLUGIN_OPTIONS = Symbol('ZITADEL_PLUGIN_OPTIONS');
export const loggerCtx = 'ZitadelPlugin';

export const ZITADEL_STRATEGY_NAME = 'zitadel';

export const WISKO_AUTH_PATH = 'wisko-auth';
export const SIGNED_OUT_QUERY = 'signedout';
export const ERROR_QUERY = 'error';
export const NO_ACCESS_ERROR = 'no-access';
export const SIGN_IN_FAILED_ERROR = 'failed';
export const PENDING_SIGN_IN_MS = 10 * 60 * 1000;

export const PLATFORM_ADMIN_ROLE = 'platform-admin';
export const ROLES_CLAIM = 'urn:zitadel:iam:org:project:roles';

export const CATALOG_APP_KEY = 'vendure';
export const ACCESS_ROLE = 'access';
export const WISKO_ROLE_PREFIX = 'wisko:';

export const ROLE_SYNC_EXCHANGE = 'wisko.auth';
export const ROLE_SYNC_QUEUE = 'wisko.auth.vendure';
export const ROLE_SYNC_DEAD_QUEUE = 'wisko.auth.vendure.dead';
export const USER_ROLES_ROUTING_KEY = 'user.roles';
export const CATALOG_ROUTING_KEY = 'roles.catalog';
export const RETRY_DELAYS_SECONDS = [1, 2, 4, 8, 16];

export const ACCOUNT_CHECK_BATCH_SIZE = 100;
