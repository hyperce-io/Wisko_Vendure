# Wisko Vendure — ERP Integration API Specification

## Overview

This document defines the JSON payload format for syncing organizational hierarchy and store data from the ERP system into Vendure. The ERP is the source of truth for Companies, Tenants (regional business units), and Channels (stores).

All payloads are sent to a single endpoint:

```
POST /admin-api
Content-Type: application/json
Authorization: Bearer <service-account-token>

{
  "query": "mutation SyncFromErp($input: SyncFromErpInput!) { syncFromErp(input: $input) { ... } }",
  "variables": { "input": <payload> }
}
```

---

## Hierarchy

```
Company (Nike)                    ← the brand / top-level organization
  └── Tenant (Nike India Pvt Ltd) ← legal entity / regional business unit
       └── Channel (Mumbai Store) ← actual store that sells products
```

**Rules:**
- No Tenant without a Company
- No Channel without a Tenant
- Company code + Tenant code + Channel erpChannelId are the idempotency keys
- Re-sending the same codes = update, never duplicate

---

## Payload Scenarios

### 1. Full Sync — Company + Tenant + Channel + Admins (all at once)

Use when onboarding a completely new organization with its first store.

```json
{
  "company": {
    "code": "nike",
    "name": "Nike",
    "enabled": true,
    "admin": {
      "email": "boss@nike.com",
      "password": "securepass123",
      "firstName": "Nike",
      "lastName": "Admin"
    }
  },
  "tenant": {
    "code": "nike-india",
    "name": "Nike India Pvt Ltd",
    "maxChannels": 10,
    "admin": {
      "email": "admin@nike-india.com",
      "password": "securepass123",
      "firstName": "Nike India",
      "lastName": "Admin"
    }
  },
  "channel": {
    "erpChannelId": "ERP-NI-001",
    "code": "nike-india-mumbai",
    "name": "Nike India Mumbai Store",
    "defaultCurrencyCode": "INR",
    "defaultLanguageCode": "en",
    "pricesIncludeTax": true
  }
}
```

**What Vendure does:**
1. Creates Company "nike" + company admin role + admin account `boss@nike.com`
2. Creates Tenant "nike-india" under Nike + tenant admin role + admin account `admin@nike-india.com`
3. Creates Channel "nike-india-mumbai" under Nike India
4. Hook fires: adds channel to tenant role + company role
5. `boss@nike.com` can now see mumbai store
6. `admin@nike-india.com` can now see mumbai store

---

### 2. Company Only (no tenants or channels yet)

Use when registering a new brand before any regional entities exist.

```json
{
  "company": {
    "code": "jordan",
    "name": "Jordan Brand",
    "enabled": true,
    "admin": {
      "email": "boss@jordan.com",
      "password": "securepass123",
      "firstName": "Jordan",
      "lastName": "Admin"
    }
  }
}
```

**What Vendure does:**
1. Creates Company "jordan" + admin role (empty channels) + admin account
2. `boss@jordan.com` can log in but sees 0 channels (no stores yet)

---

### 3. Company + Tenant (no channel yet)

Use when a new regional entity is created but stores haven't been set up.

```json
{
  "company": {
    "code": "nike"
  },
  "tenant": {
    "code": "nike-uk",
    "name": "Nike UK Ltd",
    "maxChannels": 5,
    "admin": {
      "email": "admin@nike-uk.com",
      "password": "securepass123",
      "firstName": "Nike UK",
      "lastName": "Admin"
    }
  }
}
```

**What Vendure does:**
1. Finds existing Company "nike" (already exists, `admin` field ignored)
2. Creates Tenant "nike-uk" under Nike + tenant admin role + admin account
3. `admin@nike-uk.com` can log in but sees 0 channels (no stores yet)
4. `boss@nike.com` still sees only previously created channels (nothing new added)

---

### 4. Add a Channel to existing Company + Tenant

Use when a new store opens under an existing organization/region.

```json
{
  "company": {
    "code": "nike"
  },
  "tenant": {
    "code": "nike-india"
  },
  "channel": {
    "erpChannelId": "ERP-NI-002",
    "code": "nike-india-delhi",
    "name": "Nike India Delhi Store",
    "defaultCurrencyCode": "INR",
    "defaultLanguageCode": "en",
    "pricesIncludeTax": true
  }
}
```

**What Vendure does:**
1. Finds Company "nike" (exists)
2. Finds Tenant "nike-india" (exists)
3. Creates Channel "nike-india-delhi"
4. Hook: adds to `tenant-nike-india-admin` role + `company-nike-admin` role
5. Both `admin@nike-india.com` and `boss@nike.com` now see delhi store

---

### 5. Add a new Tenant + Channel to existing Company

Use when a new region launches with its first store.

```json
{
  "company": {
    "code": "nike"
  },
  "tenant": {
    "code": "nike-japan",
    "name": "Nike Japan KK",
    "maxChannels": 8,
    "admin": {
      "email": "admin@nike-japan.com",
      "password": "securepass123",
      "firstName": "Nike Japan",
      "lastName": "Admin"
    }
  },
  "channel": {
    "erpChannelId": "ERP-NJ-001",
    "code": "nike-japan-tokyo",
    "name": "Nike Japan Tokyo Store",
    "defaultCurrencyCode": "JPY",
    "defaultLanguageCode": "ja",
    "pricesIncludeTax": true
  }
}
```

---

### 6. Bulk Sync — Multiple Channels at once

Use when syncing multiple stores for the same tenant in one call.

```json
{
  "company": {
    "code": "nike"
  },
  "tenant": {
    "code": "nike-india"
  },
  "channels": [
    {
      "erpChannelId": "ERP-NI-001",
      "code": "nike-india-mumbai",
      "name": "Mumbai Store",
      "defaultCurrencyCode": "INR",
      "defaultLanguageCode": "en",
      "pricesIncludeTax": true
    },
    {
      "erpChannelId": "ERP-NI-002",
      "code": "nike-india-delhi",
      "name": "Delhi Store",
      "defaultCurrencyCode": "INR",
      "defaultLanguageCode": "en",
      "pricesIncludeTax": true
    },
    {
      "erpChannelId": "ERP-NI-003",
      "code": "nike-india-bangalore",
      "name": "Bangalore Store",
      "defaultCurrencyCode": "INR",
      "defaultLanguageCode": "en",
      "pricesIncludeTax": true
    }
  ]
}
```

---

### 7. Full Organization Sync (entire hierarchy in one call)

Use for initial onboarding of a complete organization.

```json
{
  "company": {
    "code": "adidas",
    "name": "Adidas AG",
    "enabled": true,
    "admin": {
      "email": "global@adidas.com",
      "password": "securepass123",
      "firstName": "Adidas",
      "lastName": "Global Admin"
    }
  },
  "tenants": [
    {
      "code": "adidas-eu",
      "name": "Adidas Europe GmbH",
      "maxChannels": 20,
      "admin": {
        "email": "admin@adidas-eu.com",
        "password": "securepass123",
        "firstName": "Adidas EU",
        "lastName": "Admin"
      },
      "channels": [
        {
          "erpChannelId": "ERP-AEU-001",
          "code": "adidas-eu-berlin",
          "name": "Berlin Store",
          "defaultCurrencyCode": "EUR",
          "defaultLanguageCode": "de",
          "pricesIncludeTax": true
        },
        {
          "erpChannelId": "ERP-AEU-002",
          "code": "adidas-eu-paris",
          "name": "Paris Store",
          "defaultCurrencyCode": "EUR",
          "defaultLanguageCode": "fr",
          "pricesIncludeTax": true
        }
      ]
    },
    {
      "code": "adidas-us",
      "name": "Adidas America Inc",
      "maxChannels": 15,
      "admin": {
        "email": "admin@adidas-us.com",
        "password": "securepass123",
        "firstName": "Adidas US",
        "lastName": "Admin"
      },
      "channels": [
        {
          "erpChannelId": "ERP-AUS-001",
          "code": "adidas-us-nyc",
          "name": "New York Store",
          "defaultCurrencyCode": "USD",
          "defaultLanguageCode": "en",
          "pricesIncludeTax": false
        }
      ]
    }
  ]
}
```

---

## Admin Management

### 8. Add a new admin to an existing Tenant

```json
{
  "company": {
    "code": "nike"
  },
  "tenant": {
    "code": "nike-india"
  },
  "admin": {
    "email": "manager@nike-india.com",
    "password": "securepass123",
    "firstName": "Ravi",
    "lastName": "Kumar",
    "role": "tenant-admin"
  }
}
```

**Role options:**
- `"tenant-admin"` — sees all channels in the tenant (default)
- `"store-staff"` — sees only specific channels (requires `channelCodes` field)

---

### 9. Add a store-level staff member

```json
{
  "company": {
    "code": "nike"
  },
  "tenant": {
    "code": "nike-india"
  },
  "admin": {
    "email": "staff@mumbai-store.com",
    "password": "securepass123",
    "firstName": "Amit",
    "lastName": "Patel",
    "role": "store-staff",
    "channelCodes": ["nike-india-mumbai"]
  }
}
```

**What Vendure does:**
1. Creates an Administrator `staff@mumbai-store.com`
2. Creates a Role scoped to only `nike-india-mumbai` channel
3. Staff can only see/manage the Mumbai store

---

### 10. Add a Company-level admin

```json
{
  "company": {
    "code": "nike"
  },
  "admin": {
    "email": "regional-head@nike.com",
    "password": "securepass123",
    "firstName": "Sarah",
    "lastName": "Johnson",
    "role": "company-admin"
  }
}
```

---

### 11. Deactivate an admin

```json
{
  "company": {
    "code": "nike"
  },
  "admin": {
    "email": "old-admin@nike-india.com",
    "action": "deactivate"
  }
}
```

---

### 12. Update admin role / channel access

```json
{
  "company": {
    "code": "nike"
  },
  "admin": {
    "email": "staff@mumbai-store.com",
    "action": "update",
    "role": "store-staff",
    "channelCodes": ["nike-india-mumbai", "nike-india-delhi"]
  }
}
```

---

## Suspend / Reactivate

### 13. Suspend an entire Company

All admins under this company lose access.

```json
{
  "company": {
    "code": "nike",
    "enabled": false
  }
}
```

### 14. Suspend a Tenant

All admins under this tenant lose access. Company admin still works.

```json
{
  "company": {
    "code": "nike"
  },
  "tenant": {
    "code": "nike-india",
    "enabled": false
  }
}
```

---

## Field Reference

### Company Object

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | Always | Unique identifier, lowercase, no spaces. Idempotency key. |
| `name` | string | On first creation | Display name |
| `enabled` | boolean | No | Default `true`. Set `false` to suspend. |
| `admin` | object | On first creation | Ignored if company already exists |
| `admin.email` | string | Yes (in admin) | Must be unique across all admins |
| `admin.password` | string | Yes (in admin) | Min 8 chars |
| `admin.firstName` | string | Yes (in admin) | |
| `admin.lastName` | string | Yes (in admin) | |

### Tenant Object

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | Always | Unique within the company. Idempotency key. |
| `name` | string | On first creation | Display name |
| `maxChannels` | number | No | Default 5. Max stores allowed under this tenant. |
| `enabled` | boolean | No | Default `true`. Set `false` to suspend. |
| `admin` | object | On first creation | Ignored if tenant already exists |
| `admin.email` | string | Yes (in admin) | Must be unique |
| `admin.password` | string | Yes (in admin) | |
| `admin.firstName` | string | Yes (in admin) | |
| `admin.lastName` | string | Yes (in admin) | |

### Channel Object

| Field | Type | Required | Notes |
|---|---|---|---|
| `erpChannelId` | string | Always | Unique external ID. Idempotency key — re-send = update. |
| `code` | string | Always | Unique channel code in Vendure |
| `name` | string | On first creation | Display name |
| `defaultCurrencyCode` | string | No | ISO 4217 (INR, USD, EUR, GBP, JPY). Default: USD |
| `defaultLanguageCode` | string | No | ISO 639-1 (en, de, fr, ja, hi). Default: en |
| `pricesIncludeTax` | boolean | No | Default: false |

### Admin Object (standalone)

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | Always | Unique identifier |
| `password` | string | On creation | Not needed for deactivate/update |
| `firstName` | string | On creation | |
| `lastName` | string | On creation | |
| `role` | string | No | `"company-admin"`, `"tenant-admin"` (default), `"store-staff"` |
| `channelCodes` | string[] | For store-staff | Which specific stores this admin can see |
| `action` | string | No | `"create"` (default), `"deactivate"`, `"update"` |

---

## Validation Rules

| Rule | Error |
|---|---|
| `tenant` provided without `company` | `"company.code is required when providing a tenant"` |
| `channel` provided without `tenant` | `"tenant.code is required when providing a channel"` |
| `channel` provided without `company` | `"company.code is required when providing a channel"` |
| Duplicate `company.code` on create | Uses existing (idempotent, not an error) |
| Duplicate `tenant.code` within same company | Uses existing (idempotent) |
| Duplicate `erpChannelId` | Updates existing channel (idempotent) |
| Tenant channel count exceeds `maxChannels` | `"Tenant has reached maximum channel limit"` |
| `admin.email` already exists | `"Administrator with this email already exists"` |
| Company/Tenant `enabled: false` | All admins under it are blocked from login |

---

## Response Format

### Success

```json
{
  "data": {
    "syncFromErp": {
      "success": true,
      "company": {
        "id": "1",
        "code": "nike",
        "name": "Nike",
        "isNew": false
      },
      "tenant": {
        "id": "2",
        "code": "nike-india",
        "name": "Nike India Pvt Ltd",
        "isNew": true
      },
      "channels": [
        {
          "id": "5",
          "code": "nike-india-mumbai",
          "erpChannelId": "ERP-NI-001",
          "isNew": true
        }
      ],
      "admins": [
        {
          "email": "admin@nike-india.com",
          "isNew": true
        }
      ]
    }
  }
}
```

### Error

```json
{
  "errors": [
    {
      "message": "company.code is required when providing a tenant",
      "extensions": {
        "code": "BAD_USER_INPUT"
      }
    }
  ]
}
```

---

## Authentication

The ERP authenticates as a service account with SuperAdmin permissions:

```
POST /admin-api
Headers:
  Content-Type: application/json
  Authorization: Bearer <jwt-token>
```

To obtain the token:
```json
{
  "query": "mutation { login(username: \"erp-service\", password: \"...\") { ... on CurrentUser { id } } }"
}
```

Or use a Vendure API Key (recommended for service-to-service):
```
Headers:
  vendure-token: <channel-token>
  Authorization: Bearer <api-key>
```

---

## Idempotency Summary

| Entity | Idempotency Key | Re-send behavior |
|---|---|---|
| Company | `company.code` | Found → use existing, skip creation |
| Tenant | `tenant.code` (within company) | Found → use existing, link to company if not already |
| Channel | `channel.erpChannelId` | Found → update fields, never duplicate |
| Admin | `admin.email` | Found → skip creation (or update if `action: "update"`) |

The ERP can safely re-send the same payload multiple times. Nothing will be duplicated.

---

## Visibility After Sync

After syncing `Nike → Nike India → Mumbai + Delhi` and `Nike → Nike UK → London`:

| Login | Sees | Level |
|---|---|---|
| `boss@nike.com` | mumbai, delhi, london | Company admin (all Nike) |
| `admin@nike-india.com` | mumbai, delhi | Tenant admin (India only) |
| `admin@nike-uk.com` | london | Tenant admin (UK only) |
| `staff@mumbai-store.com` | mumbai | Store staff (one store) |
| `superadmin` | everything | SuperAdmin |
