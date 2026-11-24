export interface ZitadelPluginOptions {
    issuer: string;
    projectId: string;
    /** The ZITADEL organization that owns the Wisko project: platform-admin counts only when it granted it. */
    platformOrgId: string;
    clientId: string;
    clientSecret: string;
    /** A read-only service user's token (IAM_OWNER_VIEWER), for the account check and the deployed role catalog. */
    serviceToken: string;
    sessionHours: number;
    /** The public address of this Vendure server, e.g. http://localhost:3000. */
    vendureUrl: string;
    /** Where DashboardPlugin serves the dashboard, e.g. /dashboard. */
    dashboardPath: string;
    rabbitmqUrl: string;
}

/** Kept in Vendure's signed session cookie between leaving for ZITADEL and coming back. */
export interface PendingSignIn {
    state: string;
    nonce: string;
    codeVerifier: string;
    returnTo: string;
    startedAt: number;
}

export interface ZitadelIdentity {
    zitadelUserId: string;
    email: string;
    firstName: string;
    lastName: string;
    isPlatformAdmin: boolean;
    hasStoreAccess: boolean;
    signedInAt: Date;
}

/** Vendure's cookie-session data (`token` is Vendure's own), plus the sign-in state kept beside it. */
export interface WiskoCookieSession {
    token?: string;
    wiskoPendingSignIn?: PendingSignIn | null;
    wiskoSignedIn?: boolean | null;
}

export interface HeldRole {
    role: string;
    scopes: string[];
}

export interface UserRolesMessage {
    zitadelUserId: string;
    email: string | null;
    active: boolean;
    deleted: boolean;
    platformAdmin: boolean;
    position: string;
    roles: HeldRole[];
}

export interface VendureRoleCatalog {
    version: number;
    /** Catalog role key (e.g. orders.order.read) → Vendure permission names. */
    rolePermissions: Map<string, string[]>;
}

declare module 'express-serve-static-core' {
    interface Request {
        session?: WiskoCookieSession | null;
    }
}

declare module '@vendure/core/dist/entity/custom-entity-fields' {
    interface CustomRoleFields {
        /** JSON list of the wisko_org_uids a wisko: role covers. */
        wiskoScopeUids: string | null;
    }
    interface CustomAdministratorFields {
        /** The `position` of the last role-relay message applied to this admin. */
        wiskoRolePosition: string | null;
    }
}
