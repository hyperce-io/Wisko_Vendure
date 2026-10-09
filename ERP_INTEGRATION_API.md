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
| `invoice.created` | Attach an ERP-generated invoice PDF to an order |
| `tax_category.updated` | Create a tax category named after an ERP Item Tax Template and set its rate in each store channel's tax zone |
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

Storefront content (descriptions, images, video, specs, SEO, translated names) does not come from
the ERP. It is edited in Strapi and arrives as `product_content.published` (see
`src/plugins/tenant/services/product-content-sync.service.ts`).

### product.created

Create a product with variants. Optionally assign to channels immediately.

```json
{
  "product": {
    "erpProductId": "PROD-001",
    "name": "Air Max 90",
    "slug": "erp-PROD-001",
    "ownerCode": "a1b2c3d4",
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

## Invoice

### invoice.created

Attaches an invoice PDF generated in ERP to an existing Vendure order.

```json
{
  "vendure_order_code": "DEPLOY-TEST-1",
  "fileUrl": "https://clicksdev.blob.core.windows.net/frappe-uploads-private/invoices/ACC-SINV-2026-00014.pdf?se=...&sig=...",
  "idempotency_key": "erpnext:invoice:ACC-SINV-2026-00014:DEPLOY-TEST-1",
  "erp_channel_id": "582c9de64650d31c"
}
```

| Field | Required | Notes |
|---|---|---|
| `vendure_order_code` | Yes | Must match an existing order; unknown codes are rejected to the DLQ |
| `fileUrl` | Yes | Downloaded immediately and stored permanently — see below |
| `idempotency_key` | No | Redelivery with the same key is a no-op |
| `erp_channel_id` | No | Accepted, not currently used for routing |

**The routing key is `invoice.created`, not `order.invoice_created`.** Vendure
publishes its own `order.*` events to this same exchange, so nothing under
`order.*` is bound inbound — a message sent there would never be consumed.

**`fileUrl` is fetched at once, while the SAS signature is still valid.** The
links ERP sends expire (`?se=<expiry>`) and point into a private container, so
the URL is not stored; the PDF is downloaded and kept as a Vendure Asset. If the
link has already expired by the time the message is processed, the message is
rejected to the DLQ rather than silently recording a dead link.

Other fields in the message (`currency`, `total_taxes_and_charges`, `taxes[]`)
are accepted and ignored — Vendure computes its own tax.

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
| `name` | string | On create/update | Product name. Vendure uses it only when it creates the product; after that the name comes from Strapi |
| `slug` | string | No | Auto-generated as `erp-{erpProductId}` if omitted |
| `ownerCode` | string | No | The owning Company's uid. Read by Strapi (owner of the Product Content); ignored by Vendure |
| `enabled` | boolean | No | Default: true |
| `variants` | array | On create | At least one variant required |
| `channelCodes` | string[] | No | Assign to these channels on create |

### Product Variant

| Field | Type | Required | Notes |
|---|---|---|---|
| `sku` | string | Always | Unique — used for idempotent upsert |
| `name` | string | Always | Variant display name. Used only when Vendure creates the variant; after that it comes from Strapi |
| `price` | number | Always | Price in minor units (cents/paise) |
| `stockOnHand` | number | No | Default: 0 |
| `trackInventory` | boolean | No | Default: false |
| `enabled` | boolean | No | Default: true |
| `weight` | number \| null | No | Kilograms per unit, from the ERP Item's weight. Stored in the variant's `weight` custom field. Omitted keeps the current value |
| `taxCategory` | string \| null | No | The ERP Item Tax Template's title ("GST 18%", "Nepal Tax"); the variant is put in the Vendure tax category of that name (created if missing). Omitted keeps the current category |
| `taxRate` | number \| null | No | The % that template charges; each channel the product is assigned to gets it as the category's tax rate in its default tax zone |

---

### Tax Category (`tax_category.updated`)

Sent when an ERP Item Tax Template is created or changed. Categories are platform-wide; the rate is
set per tax zone, for each listed store channel that exists in Vendure (a missing one gets it on its
first product sync).

```json
{
  "name": "GST 18%",
  "rate": 18,
  "erp_channel_ids": ["a1b2c3d4e5f6a7b8"],
  "idempotency_key": "erpnext:tax-category:GST 18% - BYD"
}
```

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
