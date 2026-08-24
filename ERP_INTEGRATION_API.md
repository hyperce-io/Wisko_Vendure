# Wisko Vendure — RabbitMQ Sync Contract

## Connection

```
Host:     4.240.93.82
Port:     5672
User:     admin
Password: admin
```

## Exchange & Queue

```
Exchange:  wisko.sync          (type: topic, durable)
Queue:     wisko.sync.vendure  (durable, DLQ-enabled)
DLQ:       wisko.sync.vendure.dlq
```

## Routing Keys

| Routing Key | Description |
|---|---|
| `company.created` | Create a new company |
| `company.updated` | Update company name/enabled |
| `company.deleted` | Suspend (disable) a company |
| `tenant.created` | Create a new tenant under a company |
| `tenant.updated` | Update tenant name/enabled |
| `tenant.deleted` | Suspend (disable) a tenant |
| `channel.created` | Create a new channel (store) under a tenant |
| `channel.updated` | Update channel details |
| `channel.deleted` | Delete a channel |
| `admin.created` | Create a new admin user |
| `admin.updated` | Update admin role/access |
| `admin.deactivated` | Deactivate an admin |
| `product.created` | Create a product with variants |
| `product.updated` | Update product + variants |
| `product.deleted` | Soft-delete a product |
| `product.assigned` | Assign a product to channel(s) |
| `product.removed` | Remove a product from channel(s) |
| `sync.full` | Full org sync (company + tenants + channels + products in one call) |

---

## Organization Payloads

### company.created

```json
{
  "company": {
    "code": "nike",
    "name": "Nike",
    "admin": {
      "email": "boss@nike.com",
      "password": "securepass",
      "firstName": "Nike",
      "lastName": "Admin"
    }
  }
}
```

### company.updated

```json
{
  "company": {
    "code": "nike",
    "name": "Nike Inc.",
    "enabled": true
  }
}
```

### company.deleted (suspend)

```json
{
  "company": {
    "code": "nike"
  }
}
```

### tenant.created

```json
{
  "company": { "code": "nike" },
  "tenant": {
    "code": "nike-india",
    "name": "Nike India Pvt Ltd",
    "admin": {
      "email": "admin@nike-india.com",
      "password": "securepass",
      "firstName": "India",
      "lastName": "Admin"
    }
  }
}
```

### tenant.updated

```json
{
  "company": { "code": "nike" },
  "tenant": {
    "code": "nike-india",
    "name": "Nike India Private Limited",
    "enabled": false
  }
}
```

### channel.created

```json
{
  "company": { "code": "nike" },
  "tenant": { "code": "nike-india" },
  "channel": {
    "erpChannelId": "ERP-NI-001",
    "code": "nike-india-mumbai",
    "name": "Mumbai Store",
    "defaultCurrencyCode": "INR",
    "defaultLanguageCode": "en",
    "pricesIncludeTax": false
  }
}
```

### channel.updated (idempotent — same erpChannelId = update)

```json
{
  "company": { "code": "nike" },
  "tenant": { "code": "nike-india" },
  "channel": {
    "erpChannelId": "ERP-NI-001",
    "code": "nike-india-mumbai",
    "name": "Mumbai Flagship Store",
    "defaultCurrencyCode": "INR"
  }
}
```

### channel.deleted

```json
{
  "channel": {
    "erpChannelId": "ERP-NI-001"
  }
}
```

### admin.created (tenant admin)

```json
{
  "company": { "code": "nike" },
  "tenant": { "code": "nike-india" },
  "admin": {
    "email": "manager@nike-india.com",
    "password": "securepass",
    "firstName": "Ravi",
    "lastName": "Kumar",
    "role": "tenant-admin"
  }
}
```

### admin.created (company admin)

```json
{
  "company": { "code": "nike" },
  "admin": {
    "email": "regional@nike.com",
    "password": "securepass",
    "firstName": "Sarah",
    "lastName": "Johnson",
    "role": "company-admin"
  }
}
```

### admin.created (store staff — single channel)

```json
{
  "company": { "code": "nike" },
  "tenant": { "code": "nike-india" },
  "admin": {
    "email": "staff@mumbai.com",
    "password": "securepass",
    "firstName": "Amit",
    "lastName": "Patel",
    "role": "store-staff",
    "channelCodes": ["nike-india-mumbai"]
  }
}
```

### admin.deactivated

```json
{
  "admin": {
    "email": "staff@mumbai.com"
  }
}
```

---

## Product Payloads

### product.created

Create a product with variants. Optionally assign to channels immediately.

```json
{
  "product": {
    "erpProductId": "PROD-001",
    "name": "Air Max 90",
    "slug": "erp-PROD-001",
    "description": "Classic Nike Air Max 90 sneakers",
    "enabled": true,
    "variants": [
      {
        "sku": "AM90-BLK-10",
        "name": "Air Max 90 Black Size 10",
        "price": 12999,
        "stockOnHand": 100,
        "trackInventory": true,
        "enabled": true
      },
      {
        "sku": "AM90-WHT-10",
        "name": "Air Max 90 White Size 10",
        "price": 12999,
        "stockOnHand": 50
      }
    ],
    "channelCodes": ["nike-india-mumbai", "nike-india-delhi"]
  }
}
```

### product.updated

Update product details + variant prices/stock. Matched by `erpProductId`. Variants matched by `sku`.

```json
{
  "product": {
    "erpProductId": "PROD-001",
    "name": "Air Max 90 (2026 Edition)",
    "description": "Updated description",
    "variants": [
      {
        "sku": "AM90-BLK-10",
        "name": "Air Max 90 Black Size 10",
        "price": 11999,
        "stockOnHand": 200
      }
    ]
  }
}
```

### product.deleted (soft delete)

```json
{
  "product": {
    "erpProductId": "PROD-001"
  }
}
```

### product.assigned

Assign an existing product to additional channels.

```json
{
  "product": {
    "erpProductId": "PROD-001",
    "channelCodes": ["nike-india-delhi", "nike-uk-london"]
  }
}
```

### product.removed

Remove a product from specific channels.

```json
{
  "product": {
    "erpProductId": "PROD-001",
    "channelCodes": ["nike-india-delhi"]
  }
}
```

---

## Full Sync

Everything in one message — company + tenants + channels + products.

```json
{
  "company": {
    "code": "adidas",
    "name": "Adidas AG",
    "admin": { "email": "global@adidas.com", "password": "securepass" }
  },
  "tenants": [
    {
      "code": "adidas-eu",
      "name": "Adidas Europe",
      "admin": { "email": "eu@adidas.com", "password": "securepass" },
      "channels": [
        { "erpChannelId": "ERP-AEU-001", "code": "adidas-berlin", "defaultCurrencyCode": "EUR" },
        { "erpChannelId": "ERP-AEU-002", "code": "adidas-paris", "defaultCurrencyCode": "EUR" }
      ]
    }
  ],
  "products": [
    {
      "erpProductId": "ADI-001",
      "name": "Ultraboost 23",
      "variants": [
        { "sku": "UB23-BLK-10", "name": "Ultraboost Black 10", "price": 18999 }
      ],
      "channelCodes": ["adidas-berlin", "adidas-paris"]
    }
  ]
}
```

---

## Field Reference

### Company

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | Always | Unique, lowercase, no spaces |
| `name` | string | On create | Display name |
| `enabled` | boolean | No | Default true. false = suspend |
| `admin` | object | On create | Ignored if company exists |

### Tenant

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | Always | Unique within company |
| `name` | string | On create | Display name |
| `enabled` | boolean | No | Default true. false = suspend |
| `admin` | object | On create | Ignored if tenant exists |

### Channel

| Field | Type | Required | Notes |
|---|---|---|---|
| `erpChannelId` | string | Always | Idempotency key — re-send = update |
| `code` | string | On create | Vendure channel code |
| `name` | string | No | Display name |
| `defaultCurrencyCode` | string | No | ISO 4217. Default: USD |
| `defaultLanguageCode` | string | No | ISO 639-1. Default: en |
| `pricesIncludeTax` | boolean | No | Default: false |

### Admin

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | Always | Unique identifier |
| `password` | string | On create | |
| `firstName` | string | On create | |
| `lastName` | string | On create | |
| `role` | string | No | `company-admin`, `tenant-admin` (default), `store-staff` |
| `channelCodes` | string[] | For store-staff | Which channels staff can access |

### Product

| Field | Type | Required | Notes |
|---|---|---|---|
| `erpProductId` | string | Always | Idempotency key — stored as slug `erp-{id}` |
| `name` | string | On create/update | Product name |
| `slug` | string | No | Auto-generated as `erp-{erpProductId}` if omitted |
| `description` | string | No | Product description |
| `enabled` | boolean | No | Default: true |
| `variants` | array | On create | At least one variant required |
| `channelCodes` | string[] | No | Assign to these channels on create |

### Product Variant

| Field | Type | Required | Notes |
|---|---|---|---|
| `sku` | string | Always | Unique — used for idempotent upsert |
| `name` | string | Always | Variant display name |
| `price` | number | Always | Price in minor units (cents/paise) |
| `stockOnHand` | number | No | Default: 0 |
| `trackInventory` | boolean | No | Default: false |
| `enabled` | boolean | No | Default: true |

---

## Idempotency

| Entity | Key | Re-send behavior |
|---|---|---|
| Company | `code` | Found → update, not duplicate |
| Tenant | `code` | Found → update, not duplicate |
| Channel | `erpChannelId` | Found → update, not duplicate |
| Admin | `email` | Found → skip |
| Product | `erpProductId` (slug) | Found → update, not duplicate |
| Variant | `sku` | Found → update, not duplicate |

---

## Validation

| Rule | Error |
|---|---|
| `tenant` without `company.code` | `company.code is required` |
| `channel` without `tenant.code` | `tenant.code is required` |
| `channel` without `company.code` | `company.code is required` |
| `product.created` without `erpProductId` | `product.erpProductId is required` |
| `product.created` without `name` | `product.name is required` |
| `product.assigned` without `channelCodes` | `product.channelCodes is required` |
| Unknown routing key | Logged as warning, message nack'd to DLQ |

---

## Error Handling

- **Success** → message ack'd, removed from queue
- **Validation error** → message nack'd, sent to DLQ (`wisko.sync.vendure.dlq`)
- **Processing error** → message nack'd, sent to DLQ
- **DLQ messages** can be inspected via RabbitMQ Management UI at `http://4.240.93.82:15672` (admin/admin)
