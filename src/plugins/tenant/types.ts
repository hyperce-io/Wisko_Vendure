import { Channel, Administrator } from '@vendure/core';
import { Company } from './entities/company.entity';
import { Tenant } from './entities/tenant.entity';

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
    pricesIncludeTax?: boolean;
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
    role?: 'company-admin' | 'tenant-admin' | 'store-staff';
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

export interface ProductVariantInput {
    sku: string;
    name: string;
    price: number;
    stockOnHand?: number;
    trackInventory?: boolean;
    enabled?: boolean;
}

export interface SyncProductInput {
    erpProductId: string;
    name: string;
    slug?: string;
    description?: string;
    enabled?: boolean;
    variants: ProductVariantInput[];
    channelCodes?: string[];
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

declare module '@vendure/core/dist/entity/custom-entity-fields' {
    interface CustomChannelFields {
        tenant: Tenant | null;
        erpChannelId: string | null;
    }
    interface CustomAdministratorFields {
        tenant: Tenant | null;
    }
}
