# Wisko Vendure — ERP Integration JSON Contracts

## Hierarchy

```
Company (Nike)                    ← the brand / organization
  └── Tenant (Nike India Pvt Ltd) ← legal entity / regional business unit
       └── Channel (Mumbai Store) ← actual store that sells products
```

**Rules:**
- No Tenant without a Company
- No Channel without a Tenant
- `company.code`, `tenant.code`, `channel.erpChannelId` are idempotency keys
- Re-sending same codes = update, never duplicate

---

## CREATE

### Create a Company

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
  }
}
```

### Create a Company + Tenant

```json
{
  "company": {
    "code": "nike"
  },
  "tenant": {
    "code": "nike-india",
    "name": "Nike India Pvt Ltd",
    "admin": {
      "email": "admin@nike-india.com",
      "password": "securepass123",
      "firstName": "Nike India",
      "lastName": "Admin"
    }
  }
}
```

### Create a Company + Tenant + Channel

```json
{
  "company": {
    "code": "nike"
  },
  "tenant": {
    "code": "nike-india"
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

### Create everything at once

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

### Bulk — multiple channels

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
    }
  ]
}
```

### Bulk — full org with multiple tenants and channels

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

## ADD ADMIN

### Add a company-level admin

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

### Add a tenant-level admin

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

### Add a store-level staff member

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

---

## UPDATE

### Update a Company

```json
{
  "company": {
    "code": "nike",
    "name": "Nike Inc."
  }
}
```

### Update a Tenant

```json
{
  "company": {
    "code": "nike"
  },
  "tenant": {
    "code": "nike-india",
    "name": "Nike India Private Limited"
  }
}
```

### Update a Channel

```json
{
  "company": {
    "code": "nike"
  },
  "tenant": {
    "code": "nike-india"
  },
  "channel": {
    "erpChannelId": "ERP-NI-001",
    "name": "Nike Mumbai Flagship",
    "defaultCurrencyCode": "INR"
  }
}
```

### Update admin role / channel access

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

## SUSPEND / REACTIVATE

### Suspend a Company (all admins under it lose access)

```json
{
  "company": {
    "code": "nike",
    "enabled": false
  }
}
```

### Reactivate a Company

```json
{
  "company": {
    "code": "nike",
    "enabled": true
  }
}
```

### Suspend a Tenant (company admin still works)

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

## DELETE / DEACTIVATE

### Deactivate an admin

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

### Delete a Channel

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
    "action": "delete"
  }
}
```

### Delete a Tenant (and all its channels)

```json
{
  "company": {
    "code": "nike"
  },
  "tenant": {
    "code": "nike-india",
    "action": "delete"
  }
}
```

---

## Field Reference

### Company

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | Always | Unique identifier, lowercase, no spaces |
| `name` | string | On create | Display name |
| `enabled` | boolean | No | Default `true`. Set `false` to suspend |
| `admin` | object | On create | Ignored if company already exists |

### Tenant

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | Always | Unique within the company |
| `name` | string | On create | Display name |
| `enabled` | boolean | No | Default `true`. Set `false` to suspend |
| `action` | string | No | `"delete"` to remove tenant + all channels |
| `admin` | object | On create | Ignored if tenant already exists |

### Channel

| Field | Type | Required | Notes |
|---|---|---|---|
| `erpChannelId` | string | Always | Unique external ID — the idempotency key |
| `code` | string | On create | Unique channel code in Vendure |
| `name` | string | On create | Display name |
| `defaultCurrencyCode` | string | No | ISO 4217 (INR, USD, EUR, GBP, JPY). Default: USD |
| `defaultLanguageCode` | string | No | ISO 639-1 (en, de, fr, ja, hi). Default: en |
| `pricesIncludeTax` | boolean | No | Default: false |
| `action` | string | No | `"delete"` to remove channel |

### Admin

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | Always | Unique identifier |
| `password` | string | On create | Not needed for deactivate/update |
| `firstName` | string | On create | |
| `lastName` | string | On create | |
| `role` | string | No | `"company-admin"`, `"tenant-admin"` (default), `"store-staff"` |
| `channelCodes` | string[] | For store-staff | Which stores this admin can access |
| `action` | string | No | `"create"` (default), `"deactivate"`, `"update"` |

---

## Validation

| Rule | Error |
|---|---|
| `tenant` without `company` | `"company.code is required"` |
| `channel` without `tenant` | `"tenant.code is required"` |
| `channel` without `company` | `"company.code is required"` |
| Duplicate codes on create | Uses existing (idempotent, not an error) |
| Duplicate `erpChannelId` | Updates existing channel (idempotent) |
| `admin.email` already exists | `"Administrator already exists"` |

---

## Response

### Success

```json
{
  "success": true,
  "company": { "id": "1", "code": "nike", "isNew": false },
  "tenant": { "id": "2", "code": "nike-india", "isNew": true },
  "channels": [
    { "id": "5", "code": "nike-india-mumbai", "erpChannelId": "ERP-NI-001", "isNew": true }
  ],
  "admins": [
    { "email": "admin@nike-india.com", "isNew": true }
  ]
}
```

### Error

```json
{
  "success": false,
  "error": "company.code is required when providing a tenant"
}
```

---

## Visibility After Sync

| Login | Sees | Level |
|---|---|---|
| `boss@nike.com` | mumbai, delhi, london | Company admin (all Nike) |
| `admin@nike-india.com` | mumbai, delhi | Tenant admin (India only) |
| `admin@nike-uk.com` | london | Tenant admin (UK only) |
| `staff@mumbai-store.com` | mumbai | Store staff (one store) |
| `superadmin` | everything | SuperAdmin |
