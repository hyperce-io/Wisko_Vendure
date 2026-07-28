# Wisko Vendure — Multi-Tenant 3-Tier Channel Hierarchy

## Complete Technical Documentation

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Architecture Overview](#2-architecture-overview)
3. [What Vendure Gives Out of the Box](#3-what-vendure-gives-out-of-the-box)
4. [What We Built (The Gap)](#4-what-we-built-the-gap)
5. [The One Rule That Explains Everything](#5-the-one-rule-that-explains-everything)
6. [Data Model](#6-data-model)
7. [How the 3 Tiers Work](#7-how-the-3-tiers-work)
8. [Flows](#8-flows)
9. [Plugin Architecture](#9-plugin-architecture)
10. [File Reference](#10-file-reference)
11. [GraphQL API Reference](#11-graphql-api-reference)
12. [Seed Script](#12-seed-script)
13. [Dashboard](#13-dashboard)
14. [Setup & Running](#14-setup--running)
15. [Testing Checklist](#15-testing-checklist)
16. [Design Decisions & Rationale](#16-design-decisions--rationale)

---

## 1. Problem Statement

We need **3 levels of visibility** in Vendure, but it only ships with 2:

```
Tier 0: SuperAdmin        → sees EVERYTHING                  (built-in)
Tier 1: Org (Nike/Jordan) → sees ALL its own 4-5 channels    ← DOES NOT EXIST OUT OF BOX
Tier 2: Store admin       → sees ONLY its 1 channel          (built-in)
```

**Real-world scenario:**
- SuperAdmin gives Vendure admin panel to **Nike** → Nike creates 4-5 channels (stores).
- SuperAdmin gives it to **Jordan** → Jordan creates 4-5 channels.
- **Nike's parent admin** sees all 4-5 Nike channels, but NOT Jordan's.
- **Jordan's parent admin** sees all 4-5 Jordan channels, but NOT Nike's.
- **Each store staff** sees only their single channel.
- **SuperAdmin** sees everything across all tenants.

Additionally, channels may be synced from an **external ERP** system which maps:
```
ERP SuperAdmin → Vendure SuperAdmin
ERP Organization → Vendure Tenant (the parent)
ERP Company → Vendure Channel (an isolated store)
```

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VENDURE SERVER                              │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  DEFAULT CHANNEL (built-in, always exists)                     │ │
│  │  Contains ALL entities from ALL channels                       │ │
│  │  Only SuperAdmin operates here                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────┐    ┌─────────────────────────────┐  │
│  │  TENANT "Nike"             │    │  TENANT "Jordan"             │  │
│  │  parentRole: nike-parent   │    │  parentRole: jordan-parent   │  │
│  │  enabled: true             │    │  enabled: true               │  │
│  │  maxChannels: 5            │    │  maxChannels: 5              │  │
│  │                             │    │                               │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐  │    │  ┌─────┐ ┌─────┐            │  │
│  │  │ N1  │ │ N2  │ │ N3  │  │    │  │ J1  │ │ J2  │            │  │
│  │  │store│ │store│ │store│  │    │  │store│ │store│            │  │
│  │  └─────┘ └─────┘ └─────┘  │    │  └─────┘ └─────┘            │  │
│  └───────────────────────────┘    └─────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. What Vendure Gives Out of the Box

| Feature | Built-in? | Notes |
|---|---|---|
| Multiple isolated channels | Yes | Each channel holds its own products, orders, customers |
| SuperAdmin sees all | Yes | `SuperAdmin` permission bypasses all checks |
| Channel-scoped roles | Yes | A `Role` has a `channels` relation; permissions apply only within them |
| Admin on multiple channels sees all of them | Yes | The key primitive for the "parent" tier |
| `Seller` entity per channel | Yes | 1:1 with channel |
| Default channel sees everything | Yes | Every channel-aware entity is always also in the default channel |
| **A "tenant" that auto-sees any NEW sub-channel** | **No** | The gap we close |
| **Grouping channels under an org + limits/suspend** | **No** | The gap we close |

---

## 4. What We Built (The Gap)

A Vendure plugin (`TenantPlugin`) that adds:

1. **Tenant entity** — the "account" (Nike/Jordan). Holds limits, enabled/suspended state, and a pointer to the parent role.
2. **Custom fields** — `Channel.tenant` (ownership link), `Channel.erpChannelId` (ERP idempotency), `Administrator.tenant` (which org an admin belongs to).
3. **ChannelEvent hook** — when a channel is created/deleted, automatically updates the tenant's parent role's channel list. This is the core auto-sync mechanism.
4. **Tenant boundary guard** — prevents cross-tenant access (Nike can't touch Jordan's channels).
5. **GraphQL Admin API** — `createTenant`, `createTenantChannel`, `syncChannelFromErp`, `updateTenant`, `tenants` query.
6. **Dashboard extension** — Tenants page with stats, data table, expandable rows showing channels + admins, and suspend/activate toggle.
7. **Seed script** — populates 54 sample products, 3 tenants (Nike, Jordan, Adidas), 7 channels, 4 admin accounts, and tests ERP sync.

---

## 5. The One Rule That Explains Everything

```ts
// What Vendure checks on every request:
adminCanSeeChannel = admin.roles.some(role =>
  role.channels.includes(theChannel)
);
```

An admin sees a channel **only if one of their roles lists that channel**. That's the entire mechanism.

- **SuperAdmin** has a special permission that bypasses this check → sees all.
- **Nike parent** is a normal role whose `channels` list = `[N1, N2, N3]` → sees all three.
- **Nike store staff** has a role whose `channels` list = `[N2]` → sees only N2.

The "hierarchy" is an **illusion created by overlapping flat lists**. There are no parent/child channels in Vendure. The plugin's job is keeping those lists correct.

```
SuperAdmin:      sees [N1, N2, N3, J1, J2, default, ...]   (everything, built-in)
nike-parent:     sees [N1, N2, N3]                          (all Nike channels)
nike-store-N2:   sees [N2]                                  (just one)
jordan-parent:   sees [J1, J2]                              (all Jordan channels)
```

Same channel N2 in two lists → both Nike parent and N2's store staff can see it. That overlap IS the hierarchy.

---

## 6. Data Model

### 6.1 Tenant Entity (custom)

```ts
@Entity()
export class Tenant extends VendureEntity {
    @Column()           code: string;        // "nike"
    @Column()           name: string;        // "Nike"
    @Column({ default: true })  enabled: boolean;
    @Column({ default: 5 })     maxChannels: number;
    @ManyToOne(() => Role)       parentRole: Role;   // the aggregator role
    @EntityId()                  parentRoleId: ID;
}
```

### 6.2 Custom Fields

```ts
// On Channel:
{ name: 'tenant',       type: 'relation', entity: Tenant }  // ownership link
{ name: 'erpChannelId', type: 'string',   unique: true }    // ERP idempotency

// On Administrator:
{ name: 'tenant',       type: 'relation', entity: Tenant }  // which org they belong to
```

### 6.3 How Entities Link

```
Tenant "nike"
  ├─ parentRole ──────────→ Role "tenant-nike-admin"
  │                           └─ channels = [N1, N2, N3]     ← THE VISIBILITY
  │
  └─ (via Channel.tenant) → Channel N1 (tenantId=1)
                             Channel N2 (tenantId=1)
                             Channel N3 (tenantId=1)

Administrator "admin@nike.com"
  ├─ roles → [tenant-nike-admin]     ← sees all Nike channels
  └─ customFields.tenant → Tenant 1  ← stamped for self-service
```

### 6.4 Database Migration

The migration (`1785226265919-tenant-plugin.ts`) creates:
- `tenant` table (code, name, enabled, maxChannels, parentRoleId FK → role)
- `channel.customFieldsTenantid` (FK → tenant)
- `channel.customFieldsErpchannelid` (unique varchar)
- `administrator.customFieldsTenantid` (FK → tenant)

---

## 7. How the 3 Tiers Work

### Tier 0 — SuperAdmin (built-in, nothing to maintain)
The `SuperAdmin` permission short-circuits all channel checks. Sees Nike, Jordan, every channel, the default channel. No config needed.

### Tier 1 — Tenant Parent (Nike / Jordan)
A normal `Role` (e.g., `tenant-nike-admin`) with real permissions (Catalog, Order, Customer...) and its `channels` list = **every channel Nike owns**.

Because permissions in a channel-scoped role apply *only within* the assigned channels:
- Nike admin **can** do everything inside N1–N3
- Nike admin **cannot** see Jordan channels, the default channel, or anything outside the list

Maintaining Tier 1 = **keeping that list accurate** → the ChannelEvent hook does this.

### Tier 2 — Store Admin (built-in)
A `Role` scoped to exactly **one** channel (e.g., `nike-outlet-staff` with `channels=[N2]`). That admin only sees N2.

---

## 8. Flows

### 8.1 Flow: SuperAdmin Onboards a Tenant (`createTenant`)

```
SuperAdmin calls createTenant(code:"nike", name:"Nike", email, password)
        │
        ▼
  ONE transaction:
    1. create Role "tenant-nike-admin"  (permissions, channels=[])
    2. create Tenant "nike"             (parentRole = that role)
    3. create Channel "nike-main"       (customFields.tenant = nike)  ← real store
    4. create Seller "Nike"
    5. create Admin admin@nike.com      (role = tenant-nike-admin, tenant = nike)
        │
        ▼
  ChannelEvent(created) fires → hook adds "nike-main" to tenant-nike-admin.channels
        │
        ▼
  Nike admin logs in, sees 1 real usable store. SuperAdmin sees it too.
```

### 8.2 Flow: ChannelEvent Hook (The Core Auto-Sync)

```
Channel N4 created (customFields.tenant = nike)
        │
        ▼
  Hook fires (server process only):
    1. getTenantForChannel(N4) → finds Tenant "nike"
    2. loads Tenant's parentRole with its channels
    3. appends N4 to the role's channelIds
    4. roleService.update() saves it
        │
        ▼
  nike-parent.channels = [N1, N2, N3, N4]  → Nike sees N4 instantly
```

On delete, the reverse: remove the channel from the list.

**Invariant maintained:** `parentRole.channels == every channel where tenant == this tenant`.

### 8.3 Flow: Tenant Self-Service (`createTenantChannel`)

```
Nike admin calls createTenantChannel(code:"nike-eu", ...)
        │
        ▼
  Plugin:
    1. Resolve caller's tenant from Administrator.customFields.tenant → "nike"
       (server-stamped, Nike cannot forge Jordan)
    2. Check tenant.enabled → must be true
    3. Check channel count < tenant.maxChannels
    4. Create channel with tenant force-stamped
        │
        ▼
  ChannelEvent fires → hook adds to nike-parent.channels → Nike sees it
```

### 8.4 Flow: ERP Sync (`syncChannelFromErp`)

```
ERP calls syncChannelFromErp(erpChannelId:"E-99", tenantCode:"adidas", ...)
        │
        ▼
  Plugin:
    1. Find tenant by code "adidas"
       ├── not found → auto-create via provisionTenant (Role + Tenant, no channel)
       └── found → use it
    2. Check erpChannelId "E-99" for idempotency
       ├── exists → update existing channel, done
       └── not found → create new channel (stamped with tenant + erpChannelId)
        │
        ▼
  ChannelEvent fires → hook adds to adidas-parent.channels → Adidas sees it
```

The ERP path is functionally the same as SuperAdmin creating — just with idempotency + auto-provision.

### 8.5 Flow: Isolation Guard

Two enforcement points:
1. **On channel creation** — tenant is server-stamped from the caller's account, never from input.
2. **On role/channel assignment** — `TenantBoundaryGuard.assertSameTenant()` checks that every channel being assigned belongs to the caller's tenant. If mismatch → `ForbiddenError`.

---

## 9. Plugin Architecture

```
src/plugins/tenant/
├── tenant.plugin.ts                ← Main plugin: entities, providers, API, dashboard, custom fields
├── entities/
│   └── tenant.entity.ts            ← Tenant custom entity (code, name, enabled, maxChannels, parentRole)
├── services/
│   └── tenant.service.ts           ← Business logic: create, provisionTenant, createTenantChannel, syncFromErp, update, findAll, findOne
├── api/
│   ├── api-extensions.ts           ← GraphQL schema (Tenant type, TenantChannel, TenantAdmin, mutations, queries)
│   └── tenant-admin.resolver.ts    ← Admin API resolver with permission guards + @Transaction()
├── events/
│   └── tenant-channel.handler.ts   ← ChannelEvent subscriber: auto-syncs parent role channels
├── guards/
│   └── tenant-boundary.guard.ts    ← Cross-tenant isolation: assertSameTenant, assertTenantEnabled
├── dashboard/
│   └── index.tsx                   ← Dashboard UI: Tenants page with stats, table, expandable channels/admins
├── types.ts                        ← TypeScript declaration merging for custom fields
└── constants.ts                    ← TENANT_ADMIN_PERMISSIONS (28 permissions)
```

---

## 10. File Reference

### `tenant.entity.ts`
The custom database entity representing a tenant/organization. Fields: `code`, `name`, `enabled`, `maxChannels`. Has a `ManyToOne` relation to `Role` (the parent aggregator role) via `parentRoleId`.

### `types.ts`
TypeScript declaration merging that tells the compiler about the custom fields added to `Channel` (`tenant`, `erpChannelId`) and `Administrator` (`tenant`).

### `constants.ts`
Defines `TENANT_ADMIN_PERMISSIONS` — the 28 Vendure permissions granted to a tenant's parent admin role (Catalog CRUD, Order read/update, Customer read/create/update, Channel create/read/update, Asset CRUD, etc.).

### `tenant.plugin.ts`
The main `@VendurePlugin` class. Registers:
- The `Tenant` entity
- Providers: `TenantService`, `TenantChannelHandler`, `TenantBoundaryGuard`
- Admin API extensions (schema + resolver)
- Custom fields via the `configuration` function
- Dashboard extension

### `api-extensions.ts`
GraphQL schema extensions defining:
- `Tenant` type (with `channels: [TenantChannel!]!` and `administrators: [TenantAdmin!]!`)
- `TenantChannel` and `TenantAdmin` sub-types
- `TenantList` wrapper
- Input types: `CreateTenantInput`, `CreateTenantChannelInput`, `SyncChannelFromErpInput`, `UpdateTenantInput`
- Query extensions: `tenants`, `tenant(id)`
- Mutation extensions: `createTenant`, `createTenantChannel`, `syncChannelFromErp`, `updateTenant`

### `tenant-admin.resolver.ts`
NestJS/GraphQL resolver mapping queries/mutations to `TenantService` methods. Permission guards:
- `tenants` / `tenant` / `createTenant` / `syncChannelFromErp` / `updateTenant` → `@Allow(Permission.SuperAdmin)`
- `createTenantChannel` → `@Allow(Permission.Authenticated)` (tenant boundary enforced in service)

### `tenant.service.ts`
Core business logic (~290 lines). Methods:
- `findAll(ctx)` — returns all tenants with their channels and admins attached
- `findOne(ctx, id)` — single tenant with parentRole, channels, admins
- `findByCode(ctx, code)` — lookup by code
- `getChannelsForTenant(tenantId)` — queries channels by `customFields.tenant` FK
- `getAdminsForTenant(tenantId)` — queries administrators by `customFields.tenant` FK
- `create(ctx, input)` — full provisioning: Role → Tenant → Channel → Seller → Administrator
- `provisionTenant(ctx, {code, name})` — lightweight: Role → Tenant (no channel). Used by ERP auto-provision.
- `createTenantChannel(ctx, input)` — self-service: resolves caller's tenant, checks limits, creates channel force-stamped
- `syncFromErp(ctx, input)` — find/auto-create tenant, idempotent create/update by `erpChannelId`
- `update(ctx, input)` — update name/enabled/maxChannels

### `tenant-channel.handler.ts`
The ChannelEvent subscriber — the heart of the auto-sync mechanism. Runs in `onApplicationBootstrap` (server process only, guarded by `processContext.isServer`). Subscribes to `ChannelEvent`:
- On `created`: finds the channel's tenant → finds the tenant's parentRole → appends the channel to the role's `channelIds` via `roleService.update()`
- On `deleted`: same but filters out the channel

### `tenant-boundary.guard.ts`
Injectable guard service with two methods:
- `assertSameTenant(ctx, channelIds)` — for each channelId, checks that its tenant matches the caller's tenant. SuperAdmin (no tenant) bypasses.
- `assertTenantEnabled(ctx)` — checks that the caller's tenant is enabled. SuperAdmin bypasses.

### `dashboard/index.tsx`
React-based Vendure Dashboard extension (~300 lines). Registers a route at `/tenants` under the Settings nav section. Features:
- Stats cards: Total Tenants, Active, Suspended, Total Channels, Total Admins
- Data table: Code, Name, Status badge (green Active / red Suspended), Channels count (/max), Admins count, Max Channels, Suspend/Activate button
- Expandable rows: click a tenant to see its Channels sub-table (code, currency, language, tax-included, token) and Administrators sub-table (name, email)
- Uses direct `fetch('/admin-api')` for GraphQL queries/mutations

### `seed.ts`
Standalone CLI script (~330 lines) that populates a fresh database. Two phases:
1. **Phase 1**: Uses Vendure's `populate()` with `@vendure/create` sample data to import 54 products, countries, zones, tax rates, shipping methods, collections.
2. **Phase 2**: Creates 3 tenants (Nike, Jordan, Adidas), 7 channels, 4 admin accounts, assigns products to channels, syncs parent roles.

---

## 11. GraphQL API Reference

### Queries

```graphql
# List all tenants with their channels and administrators
query {
  tenants {
    items {
      id code name enabled maxChannels parentRoleId
      channels { id code token defaultCurrencyCode defaultLanguageCode pricesIncludeTax }
      administrators { id firstName lastName emailAddress }
    }
    totalItems
  }
}

# Get a single tenant by ID
query {
  tenant(id: "1") {
    id code name enabled maxChannels
    channels { id code }
    administrators { id emailAddress }
  }
}
```

### Mutations

```graphql
# SuperAdmin: onboard a new tenant (creates role + tenant + channel + seller + admin)
mutation {
  createTenant(input: {
    code: "nike"
    name: "Nike"
    adminEmail: "admin@nike.com"
    adminPassword: "test123"
    channelCode: "nike-main"
    defaultCurrencyCode: USD
    defaultLanguageCode: en
  }) {
    id code name
  }
}

# Tenant admin: create a new channel (self-service, tenant auto-stamped from login)
mutation {
  createTenantChannel(input: {
    code: "nike-outlet"
    token: "nike-outlet-token"
    defaultCurrencyCode: USD
  }) {
    id code
  }
}

# SuperAdmin/ERP: sync a channel (idempotent, auto-creates tenant if missing)
mutation {
  syncChannelFromErp(input: {
    erpChannelId: "ERP-001"
    tenantCode: "adidas"
    tenantName: "Adidas"
    channelCode: "adidas-originals"
    channelToken: "adidas-originals-token"
  }) {
    id code
  }
}

# SuperAdmin: update tenant properties
mutation {
  updateTenant(input: {
    id: "1"
    name: "Nike Inc."
    enabled: false
    maxChannels: 10
  }) {
    id name enabled maxChannels
  }
}
```

---

## 12. Seed Script

### What it creates

| Tenant | Channels | Admin Login | Password |
|---|---|---|---|
| **Nike** (maxChannels=5) | nike-main, nike-outlet (USD), nike-eu (EUR) | admin@nike.com | test123 |
| **Jordan** (maxChannels=3) | jordan-main, jordan-retro | admin@jordan.com | test123 |
| **Adidas** (ERP-provisioned) | adidas-originals, adidas-performance | *(none)* | — |
| *(store staff)* | nike-outlet only | staff@nike-outlet.com | test123 |
| **SuperAdmin** | ALL | superadmin | superadmin |

### Product distribution

- nike-main: 5 products
- nike-outlet: 5 products (some overlap with main)
- nike-eu: 7 products (broader EU selection)
- jordan-main: 5 products
- jordan-retro: 5 products
- adidas-originals: 4 products
- adidas-performance: 4 products

### What it tests

1. `createTenant` — full tenant provisioning
2. Additional channel creation stamped with tenant
3. Store staff role scoped to a single channel (Tier 2)
4. Second tenant (Jordan) — fully isolated from Nike
5. `syncFromErp` — auto-creates tenant "Adidas" + channels
6. ERP idempotent re-sync — same `erpChannelId` updates, doesn't duplicate
7. Parent role channel sync
8. `updateTenant` — changes maxChannels
9. Product assignment per channel

### Usage

```bash
# On a fresh database:
npm run seed

# Then start the server:
npm run dev
```

---

## 13. Dashboard

The Tenants page is accessible at `Settings > Tenants` in the Vendure Dashboard.

### Features

- **Stats cards**: Total Tenants, Active, Suspended, Total Channels, Total Admins
- **Data table**: sortable rows with code, name, status badge, channels count, admins count, max channels
- **Expandable rows**: click any tenant row to see:
  - **Channels sub-table**: code, currency tag, language, tax-included, token
  - **Administrators sub-table**: name, email
- **Suspend/Activate**: toggle button per tenant (calls `updateTenant` mutation)
- **Real-time refresh**: table reloads after any state change

---

## 14. Setup & Running

### Prerequisites

- Node.js v20, v22, or v24
- PostgreSQL running locally on port 5432
- Git

### Initial Setup

```bash
# Clone
git clone git@github.com:hyperce-io/Wisko_Vendure.git
cd Wisko_Vendure

# Install dependencies
npm install

# Create the database
psql -c "CREATE DATABASE wisko_vendure;"

# Configure .env
cat > .env << 'EOF'
APP_ENV=dev
PORT=3000
COOKIE_SECRET=your-secret-here
SUPERADMIN_USERNAME=superadmin
SUPERADMIN_PASSWORD=superadmin
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wisko_vendure
DB_USERNAME=your-pg-user
DB_PASSWORD=
DB_SCHEMA=public
EOF

# Seed (creates schema + sample data + tenants)
npm run seed

# Start the server
npm run dev
```

### Access Points

- **Dashboard**: http://localhost:3000/dashboard
- **Admin API**: http://localhost:3000/admin-api
- **Shop API**: http://localhost:3000/shop-api
- **GraphiQL**: http://localhost:3000/graphiql/admin

### Commands

| Command | Description |
|---|---|
| `npm run dev` | Start server + worker + dashboard (Vite HMR) |
| `npm run seed` | Populate fresh database with sample data + tenants |
| `npm run build` | Build for production |
| `npm run dev:server` | Start only the backend server |
| `npm run dev:dashboard` | Start only the Vite dashboard dev server |

---

## 15. Testing Checklist

1. **SuperAdmin** (`superadmin`/`superadmin`) sees ALL channels in the channel switcher
2. **Nike admin** (`admin@nike.com`/`test123`) sees ONLY nike-main, nike-outlet, nike-eu
3. **Jordan admin** (`admin@jordan.com`/`test123`) sees ONLY jordan-main, jordan-retro
4. **Nike Outlet staff** (`staff@nike-outlet.com`/`test123`) sees ONLY nike-outlet
5. **Nike** cannot see any Jordan or Adidas channels
6. **Jordan** cannot see any Nike or Adidas channels
7. Each channel has its own subset of products — switch channels in dashboard to verify
8. **Tenants page** (`Settings > Tenants`) shows all 3 tenants with correct channel/admin counts
9. **Suspend** a tenant via the Tenants page → its admins should be blockable
10. **ERP sync** via GraphiQL: `syncChannelFromErp` with a new `erpChannelId` creates a channel; re-sending the same id updates instead of duplicating

---

## 16. Design Decisions & Rationale

### Why a Tenant entity instead of just a string?

The `tenantCode` string on a channel is enough for visibility routing (the hook finds the role by matching the code). But the entity adds:
- **Reliable FK link** to the parent role (no name-guessing `"{code}-parent"`)
- **Account-level state**: `enabled` (suspend), `maxChannels` (limits)
- **Manageable list**: SuperAdmin can view/list/manage all tenants in the Dashboard
- **Integrity**: FK can't have typos

### Why not use Vendure's Seller entity as the tenant?

`Seller` is 1:1 with a channel — it describes *one store*, not "owns 5 channels." A `Tenant` entity gives a proper home for the "owns many channels" relationship.

### Why overlapping flat lists instead of real hierarchy?

Vendure's channel model is **flat**. There are no parent/child channel relations. The hierarchy is synthesized by having a parent role's `channels` list be a superset of all its children's lists. This is simple, uses only built-in RBAC, and doesn't require modifying Vendure core.

### Why a ChannelEvent hook instead of modifying ChannelService?

The hook is non-invasive — it subscribes to events that Vendure already emits, rather than wrapping or monkey-patching core services. This makes upgrades safe and the plugin portable.

### Why does the first channel matter?

It doesn't — for visibility. The parent's "see everything" power comes from the **Role**, not from any single channel. The first channel created during `createTenant` is just a real, fully usable store so the tenant admin isn't staring at an empty account on first login.

### Why does the ERP path auto-create tenants?

Because the ERP is the source of truth for organizations. If it syncs a channel for a tenant that doesn't exist in Vendure yet, the plugin provisions it (Role + Tenant) automatically — fully hands-off.

### Why is the seed script in two phases?

Phase 1 uses Vendure's `populate()` function which requires `bootstrap()` (the full server) because it creates entities via the Shop/Admin API internally. Phase 2 uses `bootstrapWorker()` (lighter, no HTTP server) for tenant-specific seeding. They can't share a single app instance because `populate()` manages its own lifecycle.

---

## Appendix: Invariants

These invariants are maintained at write-time by the plugin:

| Invariant | Enforced by |
|---|---|
| Every tenant channel has `customFields.tenant = that tenant` | Server-stamped on create (UI from login, ERP by code) |
| `parentRole.channels == all tenant channels` | ChannelEvent hook (add on create, remove on delete) |
| A store role == exactly one channel | Single-channel role creation |
| No channel in both a Nike role and a Jordan role | Isolation guard |
| SuperAdmin sees all | Built-in, untouched |
| Tenant can be suspended | `tenant.enabled = false` checked by guard |
| Tenant can't exceed channel limit | `createTenantChannel` checks `maxChannels` |
