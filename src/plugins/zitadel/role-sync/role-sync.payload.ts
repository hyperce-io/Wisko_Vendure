// Shapes of the role relay's messages (wisko-auth relay/src/relay.mjs, docs/role-sync.md), parsed from JSON.
import { CATALOG_APP_KEY } from '../constants';
import { HeldRole, UserRolesMessage, VendureRoleCatalog } from '../types';

const POSITION_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (record: Record<string, unknown>, key: string): string | null => {
    const value = record[key];
    return typeof value === 'string' && value !== '' ? value : null;
};

const readBoolean = (record: Record<string, unknown>, key: string): boolean => record[key] === true;

const readStrings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '') : [];

/** ZITADEL event times carry up to nanoseconds; padded so two positions compare as text. */
export const positionSortKey = (position: string): string => {
    const match = POSITION_PATTERN.exec(position);
    if (!match) throw new Error(`position "${position}" is not a UTC timestamp`);
    return `${match[1]}.${(match[2] ?? '').padEnd(9, '0')}Z`;
};

export const parseRoleCatalog = (payload: unknown): VendureRoleCatalog => {
    if (!isRecord(payload)) throw new Error('catalog must be a JSON object');
    const version = payload.version;
    if (typeof version !== 'number' || !Number.isInteger(version)) throw new Error('catalog version must be a whole number');
    const app = isRecord(payload.apps) ? payload.apps[CATALOG_APP_KEY] : undefined;
    if (!isRecord(app) || !isRecord(app.roles)) throw new Error(`catalog has no apps.${CATALOG_APP_KEY}.roles`);
    const rolePermissions = new Map(
        Object.entries(app.roles).map(([role, definition]) => [
            role,
            isRecord(definition) ? readStrings(definition.permissions) : [],
        ]),
    );
    return { version, rolePermissions };
};

const parseHeldRoles = (roles: unknown): HeldRole[] => {
    const appRoles = isRecord(roles) ? roles[CATALOG_APP_KEY] : undefined;
    if (!Array.isArray(appRoles)) return [];
    return appRoles.filter(isRecord).flatMap(heldRole => {
        const role = readString(heldRole, 'role');
        return role ? [{ role, scopes: readStrings(heldRole.scopes) }] : [];
    });
};

export const parseUserRolesMessage = (payload: unknown): UserRolesMessage => {
    if (!isRecord(payload)) throw new Error('payload must be a JSON object');
    const zitadelUserId = readString(payload, 'zitadelUserId');
    if (!zitadelUserId) throw new Error('zitadelUserId is required');
    const position = readString(payload, 'position');
    if (!position) throw new Error('position is required');
    return {
        zitadelUserId,
        email: readString(payload, 'email')?.toLowerCase() ?? null,
        active: readBoolean(payload, 'active'),
        deleted: readBoolean(payload, 'deleted'),
        platformAdmin: readBoolean(payload, 'platformAdmin'),
        position: positionSortKey(position),
        roles: parseHeldRoles(payload.roles),
    };
};
