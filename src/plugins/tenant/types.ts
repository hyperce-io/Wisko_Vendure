import {
  Administrator,
  Asset,
  Channel,
  CurrencyCode,
  LanguageCode,
} from "@vendure/core";
import { Company } from "./entities/company.entity";
import { Tenant } from "./entities/tenant.entity";

// ---- Sync input types (used by RabbitMQ handler + service) ----

export interface SyncCompanyInput {
  code: string;
  name?: string;
  enabled?: boolean;
  admin?: AdminInput;
}

export interface SyncTenantInput {
  companyCode: string;
  code: string;
  name?: string;
  enabled?: boolean;
  admin?: AdminInput;
}

export interface SyncChannelInput {
  companyCode: string;
  tenantCode: string;
  erpChannelId: string;
  code?: string;
  name?: string;
  defaultCurrencyCode?: string;
  defaultLanguageCode?: string;
  availableLanguageCodes?: string[];
  pricesIncludeTax?: boolean;
}

/** A customer of a deal won in ERP: who they are, which store, and which customer group. */
export interface SyncB2bCustomerInput {
  erpChannelId: string;
  erpCustomerId: string;
  emailAddress: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  customerGroup: string;
}

export interface SyncPaymentMethodInput {
  erpChannelId: string;
  code: string;
  name: string;
  description?: string;
  enabled: boolean;
  type: string;
}

export interface SyncShippingMethodInput {
  erpChannelId: string;
  code: string;
  name: string;
  description?: string;
  enabled: boolean;
  currency?: string;
  shippingAmount: number;
}

/** tax_category.updated: an ERP Item Tax Template and the store channels its company sells in. */
export interface SyncTaxCategoryInput {
  name: string;
  rate: number;
  erpChannelIds: string[];
}

/**
 * promotion.upserted: one ERP Pricing Rule (or one Coupon Code of a coupon-based rule), in ERP
 * terms. Amounts are minor units in `currency`.
 */
export interface SyncPromotionInput {
  erpPromotionId: string;
  name: string;
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  couponCode?: string;
  usageLimit: number | null;
  perCustomerUsageLimit: number | null;
  erpChannelIds: string[];
  currency: string;
  applyOn: "transaction" | "items";
  skus: string[];
  itemGroups: string[];
  brands: string[];
  minOrderAmount: number;
  discountPercentage: number;
  discountAmount: number;
  modified: Date;
}

export interface SyncInvoiceInput {
  orderCode: string;
  fileUrl?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  status?: string;
  idempotencyKey?: string;
  erpChannelId?: string;
}

export interface AdminInput {
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
}

export interface SyncAdminInput {
  companyCode?: string;
  tenantCode?: string;
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: "company-admin" | "tenant-admin" | "store-staff";
  channelCodes?: string[];
}

// ---- Create input types (used by GraphQL resolver) ----

export interface CreateTenantInput {
  code: string;
  name: string;
  adminEmail: string;
  adminPassword: string;
  channelCode?: string;
  companyCode?: string;
  defaultCurrencyCode?: string;
  defaultLanguageCode?: string;
}

export interface CreateCompanyInput {
  code: string;
  name: string;
  adminEmail?: string;
  adminPassword?: string;
}

export interface UpdateTenantInput {
  id: string;
  name?: string;
  enabled?: boolean;
  maxChannels?: number;
}

export interface UpdateCompanyInput {
  id: string;
  name?: string;
  enabled?: boolean;
}

// ---- Product sync input types ----

export interface ProductVariantOptionInput {
  group: string;
  groupName: string;
  value: string;
}

/** A selling price in one currency, in minor units. */
export interface ProductVariantPriceInput {
  currencyCode: CurrencyCode;
  amount: number;
}

/** One store channel's own selling price, in minor units, which wins over `prices` in that channel. */
export interface ProductVariantChannelPriceInput {
  channelCode: string;
  currencyCode: CurrencyCode;
  amount: number;
}

export interface ProductVariantInput {
  sku: string;
  name: string;
  price: number | null;
  prices?: ProductVariantPriceInput[];
  channelPrices?: ProductVariantChannelPriceInput[];
  options?: ProductVariantOptionInput[];
  stockOnHand?: number;
  trackInventory?: boolean;
  enabled?: boolean;
  /** Kilograms per unit, from the ERP Item's weight. */
  weight?: number | null;
  /** The ERP Item Tax Template's title, which is the Vendure tax category's name. */
  taxCategory?: string | null;
  /** The tax rate (%) that template charges. */
  taxRate?: number | null;
  /** The ERP Item Group and every group above it, so a promotion on a parent group matches. */
  itemGroups?: string[];
  /** The ERP Brand. */
  brand?: string | null;
}

export interface SyncProductInput {
  erpProductId: string;
  name: string;
  slug?: string;
  enabled?: boolean;
  variants: ProductVariantInput[];
  channelCodes?: string[];
}

// ---- Product content (from Strapi) input types ----

export interface ProductSpecInput {
  label: string;
  value: string;
}

export interface ProductContentSeoInput {
  title: string | null;
  description: string | null;
  schema: string | null;
}

/** The media fields (images, videoUrl, specs) are absent when the message leaves them unchanged. */
export interface ProductContentFieldsInput {
  title: string;
  shortDescription: string | null;
  description: string;
  seo: ProductContentSeoInput;
  images?: string[];
  videoUrl?: string | null;
  specs?: ProductSpecInput[];
}

export interface ProductVariantContentInput extends ProductContentFieldsInput {
  sku: string;
}

/** product_content.published: one language version of a Strapi Product Content entry. */
export interface SyncProductContentInput extends ProductContentFieldsInput {
  erpProductId: string;
  languageCode: LanguageCode;
  variants: ProductVariantContentInput[];
}

export interface AssignProductToChannelInput {
  erpProductId: string;
  channelCodes: string[];
  priceFactor?: number;
}

export interface RemoveProductFromChannelInput {
  erpProductId: string;
  channelCodes: string[];
}

// ---- Response interfaces (entities with eagerly-loaded relations) ----

export interface CompanyWithRelations extends Company {
  channels: Channel[];
  administrators: Administrator[];
}

export interface TenantWithRelations extends Tenant {
  channels: Channel[];
  administrators: Administrator[];
}

// ---- Custom field declarations ----

declare module "@vendure/core/dist/entity/custom-entity-fields" {
  interface CustomChannelFields {
    tenant: Tenant | null;
    erpChannelId: string | null;
  }
  interface CustomCustomerFields {
    erpCustomerId: string | null;
  }
  interface CustomAdministratorFields {
    tenant: Tenant | null;
  }
  interface CustomOrderFields {
    erpInvoice: Asset | null;
    erpInvoiceKey: string | null;
    erpInvoiceNumber: string | null;
    erpInvoiceDate: Date | null;
    erpInvoiceStatus: string | null;
    gstin: string | null;
  }
  interface CustomProductFields {
    specs: string | null;
  }
  interface CustomProductFieldsTranslation {
    shortDescription: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    seoSchema: string | null;
  }
  interface CustomProductVariantFields {
    weight: number | null;
    erpItemGroups: string[] | null;
    erpBrand: string | null;
    /** JSON ProductSpecInput[]. */
    specs: string | null;
  }
  interface CustomProductVariantFieldsTranslation {
    description: string | null;
    shortDescription: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    seoSchema: string | null;
  }
  interface CustomAssetFields {
    sourceUrl: string | null;
  }
  interface CustomPromotionFields {
    erpPromotionId: string | null;
    erpModifiedAt: Date | null;
  }
}
