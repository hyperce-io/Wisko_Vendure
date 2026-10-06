import { Injectable } from '@nestjs/common';
import {
    Logger,
    RequestContextService,
    TransactionalConnection,
    ConfigService,
    User,
    RequestContext,
} from '@vendure/core';
import { TenantService } from '../services/tenant.service';
import { ProductSyncService } from '../services/product-sync.service';
import { InvoiceSyncService } from '../services/invoice-sync.service';
import { PaymentMethodSyncService } from '../services/payment-method-sync.service';
import { ShippingMethodSyncService } from '../services/shipping-method-sync.service';
import { TaxCategorySyncService } from '../services/tax-category-sync.service';
import { B2bCustomerSyncService } from '../services/b2b-customer-sync.service';
import { PromotionSyncService } from '../services/promotion-sync.service';
import { ROUTING_KEYS } from './rabbitmq.constants';
import {
    SyncCompanyInput,
    SyncTenantInput,
    SyncChannelInput,
    SyncAdminInput,
    SyncProductInput,
    AssignProductToChannelInput,
    RemoveProductFromChannelInput,
    SyncInvoiceInput,
    SyncPaymentMethodInput,
    SyncShippingMethodInput,
    SyncTaxCategoryInput,
    SyncB2bCustomerInput,
    SyncPromotionInput,
} from '../types';

@Injectable()
export class RabbitMQMessageHandler {
    constructor(
        private tenantService: TenantService,
        private productSyncService: ProductSyncService,
        private invoiceSyncService: InvoiceSyncService,
        private paymentMethodSyncService: PaymentMethodSyncService,
        private shippingMethodSyncService: ShippingMethodSyncService,
        private taxCategorySyncService: TaxCategorySyncService,
        private b2bCustomerSyncService: B2bCustomerSyncService,
        private promotionSyncService: PromotionSyncService,
        private requestContextService: RequestContextService,
        private connection: TransactionalConnection,
        private configService: ConfigService,
    ) {}

    private async getSuperAdminCtx(): Promise<RequestContext> {
        const { superadminCredentials } = this.configService.authOptions;
        const user = await this.connection.rawConnection.getRepository(User).findOneOrFail({
            where: { identifier: superadminCredentials.identifier },
            relations: { roles: { channels: true } },
        });
        return this.requestContextService.create({ apiType: 'admin', user });
    }

    async handle(routingKey: string, payload: any): Promise<void> {
        const ctx = await this.getSuperAdminCtx();

        switch (routingKey) {
            // Company
            case ROUTING_KEYS.COMPANY_CREATED:
            case ROUTING_KEYS.COMPANY_UPDATED:
                await this.handleCompanySync(ctx, payload);
                break;
            case ROUTING_KEYS.COMPANY_DELETED:
                await this.handleCompanyDelete(ctx, payload);
                break;

            // Tenant
            case ROUTING_KEYS.TENANT_CREATED:
            case ROUTING_KEYS.TENANT_UPDATED:
                await this.handleTenantSync(ctx, payload);
                break;
            case ROUTING_KEYS.TENANT_DELETED:
                await this.handleTenantDelete(ctx, payload);
                break;

            // Channel
            case ROUTING_KEYS.CHANNEL_CREATED:
            case ROUTING_KEYS.CHANNEL_UPDATED:
                await this.handleChannelSync(ctx, payload);
                break;
            case ROUTING_KEYS.CHANNEL_DELETED:
                await this.handleChannelDelete(ctx, payload);
                break;

            // Admin
            case ROUTING_KEYS.ADMIN_CREATED:
            case ROUTING_KEYS.ADMIN_UPDATED:
                await this.handleAdminSync(ctx, payload);
                break;
            case ROUTING_KEYS.ADMIN_DEACTIVATED:
                await this.handleAdminDeactivate(ctx, payload);
                break;

            // Product
            case ROUTING_KEYS.PRODUCT_CREATED:
            case ROUTING_KEYS.PRODUCT_UPDATED:
                await this.handleProductSync(ctx, payload);
                break;
            case ROUTING_KEYS.PRODUCT_DELETED:
                await this.handleProductDelete(ctx, payload);
                break;
            case ROUTING_KEYS.PRODUCT_ASSIGNED:
                await this.handleProductAssign(ctx, payload);
                break;
            case ROUTING_KEYS.PRODUCT_REMOVED:
                await this.handleProductRemove(ctx, payload);
                break;

            // Stock
            case ROUTING_KEYS.STOCK_LEVEL_CHANGED:
                await this.handleStockLevelChanged(ctx, payload);
                break;

            // Invoice
            case ROUTING_KEYS.INVOICE_CREATED:
            case ROUTING_KEYS.INVOICE_STATUS_CHANGED:
            case ROUTING_KEYS.INVOICE_CANCELLED:
                await this.handleInvoiceSync(ctx, payload);
                break;

            // Payment method
            case ROUTING_KEYS.PAYMENT_METHOD_CREATED:
            case ROUTING_KEYS.PAYMENT_METHOD_UPDATED:
                await this.handlePaymentMethodSync(ctx, payload);
                break;
            case ROUTING_KEYS.PAYMENT_METHOD_DELETED:
                await this.handlePaymentMethodDelete(ctx, payload);
                break;

            // Shipping method
            case ROUTING_KEYS.SHIPPING_METHOD_CREATED:
            case ROUTING_KEYS.SHIPPING_METHOD_UPDATED:
                await this.handleShippingMethodSync(ctx, payload);
                break;
            case ROUTING_KEYS.SHIPPING_METHOD_DELETED:
                await this.handleShippingMethodDelete(ctx, payload);
                break;

            // Tax category
            case ROUTING_KEYS.TAX_CATEGORY_UPDATED:
                await this.handleTaxCategorySync(ctx, payload);
                break;

            // B2B customer
            case ROUTING_KEYS.B2B_CUSTOMER_UPSERTED:
                await this.handleB2bCustomerSync(ctx, payload);
                break;

            // Promotion
            case ROUTING_KEYS.PROMOTION_UPSERTED:
                await this.handlePromotionSync(ctx, payload);
                break;
            case ROUTING_KEYS.PROMOTION_DISABLED:
                await this.handlePromotionDisable(ctx, payload);
                break;
            case ROUTING_KEYS.PROMOTION_RECONCILE:
                await this.handlePromotionReconcile(ctx, payload);
                break;

            // Full sync
            case ROUTING_KEYS.SYNC_FULL:
                await this.handleFullSync(ctx, payload);
                break;

            default:
                Logger.warn(`Unknown routing key: ${routingKey}`, 'RabbitMQHandler');
        }
    }

    // ---- Company ----

    private async handleCompanySync(ctx: RequestContext, payload: any) {
        const { company } = payload;
        if (!company?.code) throw new Error('company.code is required');
        const input: SyncCompanyInput = {
            code: company.code, name: company.name, enabled: company.enabled, admin: company.admin,
        };
        await this.tenantService.syncCompany(ctx, input);
    }

    private async handleCompanyDelete(ctx: RequestContext, payload: any) {
        if (!payload.company?.code) throw new Error('company.code is required');
        await this.tenantService.disableCompany(ctx, payload.company.code);
    }

    // ---- Tenant ----

    private async handleTenantSync(ctx: RequestContext, payload: any) {
        const { company, tenant } = payload;
        if (!company?.code) throw new Error('company.code is required for tenant sync');
        if (!tenant?.code) throw new Error('tenant.code is required');
        const input: SyncTenantInput = {
            companyCode: company.code, code: tenant.code, name: tenant.name, enabled: tenant.enabled, admin: tenant.admin,
        };
        await this.tenantService.syncTenant(ctx, input);
    }

    private async handleTenantDelete(ctx: RequestContext, payload: any) {
        if (!payload.tenant?.code) throw new Error('tenant.code is required');
        await this.tenantService.disableTenant(ctx, payload.tenant.code);
    }

    // ---- Channel ----

    private async handleChannelSync(ctx: RequestContext, payload: any) {
        const { company, tenant, channel } = payload;
        if (!company?.code) throw new Error('company.code is required');
        if (!tenant?.code) throw new Error('tenant.code is required');
        if (!channel?.erpChannelId) throw new Error('channel.erpChannelId is required');
        const input: SyncChannelInput = {
            companyCode: company.code, tenantCode: tenant.code, erpChannelId: channel.erpChannelId,
            code: channel.code, name: channel.name,
            defaultCurrencyCode: channel.defaultCurrencyCode, defaultLanguageCode: channel.defaultLanguageCode,
            pricesIncludeTax: channel.pricesIncludeTax,
        };
        await this.tenantService.syncChannel(ctx, input);
    }

    private async handleChannelDelete(ctx: RequestContext, payload: any) {
        if (!payload.channel?.erpChannelId) throw new Error('channel.erpChannelId is required');
        await this.tenantService.deleteChannel(ctx, payload.channel.erpChannelId);
    }

    // ---- Admin ----

    private async handleAdminSync(ctx: RequestContext, payload: any) {
        const { company, tenant, admin } = payload;
        if (!admin?.email) throw new Error('admin.email is required');
        const input: SyncAdminInput = {
            companyCode: company?.code, tenantCode: tenant?.code,
            email: admin.email, password: admin.password,
            firstName: admin.firstName, lastName: admin.lastName,
            role: admin.role || 'tenant-admin', channelCodes: admin.channelCodes,
        };
        await this.tenantService.syncAdmin(ctx, input);
    }

    private async handleAdminDeactivate(ctx: RequestContext, payload: any) {
        if (!payload.admin?.email) throw new Error('admin.email is required');
        await this.tenantService.deactivateAdmin(ctx, payload.admin.email);
    }

    // ---- Product ----

    private async handleProductSync(ctx: RequestContext, payload: any) {
        const { product, idempotency_key } = payload;
        if (!product?.erpProductId) throw new Error('product.erpProductId is required');
        if (!product?.name) throw new Error('product.name is required');
        if (idempotency_key) {
            Logger.info(`Product sync idempotency_key: ${idempotency_key}`, 'RabbitMQHandler');
        }
        const input: SyncProductInput = {
            erpProductId: product.erpProductId,
            name: product.name,
            slug: product.slug,
            description: product.description,
            enabled: product.enabled,
            variants: product.variants || [],
            channelCodes: product.channelCodes,
        };
        await this.productSyncService.syncProduct(ctx, input);
    }

    private async handleProductDelete(ctx: RequestContext, payload: any) {
        if (!payload.product?.erpProductId) throw new Error('product.erpProductId is required');
        await this.productSyncService.deleteProduct(ctx, payload.product.erpProductId);
    }

    private async handleProductAssign(ctx: RequestContext, payload: any) {
        const { product } = payload;
        if (!product?.erpProductId) throw new Error('product.erpProductId is required');
        if (!product?.channelCodes?.length) throw new Error('product.channelCodes is required');
        await this.productSyncService.assignToChannels(ctx, product.erpProductId, product.channelCodes);
    }

    private async handleProductRemove(ctx: RequestContext, payload: any) {
        const { product } = payload;
        if (!product?.erpProductId) throw new Error('product.erpProductId is required');
        if (!product?.channelCodes?.length) throw new Error('product.channelCodes is required');
        await this.productSyncService.removeFromChannels(ctx, product.erpProductId, product.channelCodes);
    }

    // ---- Stock ----

    private async handleStockLevelChanged(ctx: RequestContext, payload: any) {
        const items: Array<{ sku: string; qty: number; reserved?: number; warehouse?: string }> = [];
        let erpChannelId: string | undefined;

        // ERPNext format: { item_code, actual_qty, reserved_qty, warehouse }
        if (payload.item_code && payload.actual_qty !== undefined) {
            items.push({
                sku: payload.item_code,
                qty: payload.actual_qty,
                reserved: payload.reserved_qty,
                warehouse: payload.warehouse,
            });
            erpChannelId = payload.erp_channel_id;
        }
        // Simple format: { sku, qty }
        else if (payload.sku && payload.qty !== undefined) {
            items.push({ sku: payload.sku, qty: payload.qty });
        }
        // Nested format: { product.variants[] }
        else if (payload.product?.variants) {
            for (const v of payload.product.variants) {
                if (v.sku) items.push({ sku: v.sku, qty: v.stockOnHand ?? v.qty ?? 0 });
            }
        }
        // Array format: { items[] }
        else if (payload.items) {
            for (const item of payload.items) {
                if (item.sku || item.item_code) {
                    items.push({ sku: item.sku || item.item_code, qty: item.qty ?? item.actual_qty ?? item.stockOnHand ?? 0 });
                }
            }
        }

        if (items.length === 0) {
            Logger.warn(`stock.level_changed: no valid items found in payload`, 'RabbitMQHandler');
            Logger.warn(`Payload: ${JSON.stringify(payload).substring(0, 500)}`, 'RabbitMQHandler');
            return;
        }

        await this.productSyncService.updateStock(ctx, items, erpChannelId);
    }

    // ---- Invoice ----

    private async handleInvoiceSync(ctx: RequestContext, payload: any) {
        // ERPNext sends snake_case; accept camelCase too so the contract is forgiving.
        const orderCode = payload.vendure_order_code || payload.vendureOrderCode || payload.orderCode;
        if (!orderCode) throw new Error('vendure_order_code is required');

        const input: SyncInvoiceInput = {
            orderCode,
            fileUrl: payload.fileUrl || payload.file_url,
            invoiceNumber: payload.invoice_number || payload.invoiceNumber,
            invoiceDate: payload.invoice_date || payload.invoiceDate,
            status: payload.status,
            idempotencyKey: payload.idempotency_key || payload.idempotencyKey,
            erpChannelId: payload.erp_channel_id || payload.erpChannelId,
        };
        await this.invoiceSyncService.syncInvoice(ctx, input);
    }

    // ---- B2B customer ----

    private async handleB2bCustomerSync(ctx: RequestContext, payload: any) {
        const customer = payload.customer || {};
        if (!payload.erp_channel_id) throw new Error('erp_channel_id is required');
        if (!customer.emailAddress) throw new Error('customer.emailAddress is required');
        if (!payload.customer_group) throw new Error('customer_group is required');
        const input: SyncB2bCustomerInput = {
            erpChannelId: payload.erp_channel_id,
            erpCustomerId: payload.erp_customer_id,
            emailAddress: customer.emailAddress,
            firstName: customer.firstName || customer.emailAddress,
            lastName: customer.lastName || '',
            phoneNumber: customer.phoneNumber,
            customerGroup: payload.customer_group,
        };
        await this.b2bCustomerSyncService.syncB2bCustomer(ctx, input);
    }

    // ---- Payment method ----

    private async handlePaymentMethodSync(ctx: RequestContext, payload: any) {
        if (!payload.erp_channel_id) throw new Error('erp_channel_id is required');
        if (!payload.code) throw new Error('code is required');
        if (!payload.name) throw new Error('name is required');
        const input: SyncPaymentMethodInput = {
            erpChannelId: payload.erp_channel_id,
            code: payload.code,
            name: payload.name,
            description: payload.description,
            enabled: payload.enabled !== false,
            type: payload.type,
        };
        await this.paymentMethodSyncService.syncPaymentMethod(ctx, input);
    }

    private async handlePaymentMethodDelete(ctx: RequestContext, payload: any) {
        if (!payload.erp_channel_id) throw new Error('erp_channel_id is required');
        if (!payload.code) throw new Error('code is required');
        await this.paymentMethodSyncService.removePaymentMethodFromChannel(ctx, {
            erpChannelId: payload.erp_channel_id,
            code: payload.code,
        });
    }

    // ---- Shipping method ----

    private async handleShippingMethodSync(ctx: RequestContext, payload: any) {
        if (!payload.erp_channel_id) throw new Error('erp_channel_id is required');
        if (!payload.code) throw new Error('code is required');
        if (!payload.name) throw new Error('name is required');
        if (!Number.isInteger(payload.shipping_amount)) throw new Error('shipping_amount must be an integer in minor units');
        const input: SyncShippingMethodInput = {
            erpChannelId: payload.erp_channel_id,
            code: payload.code,
            name: payload.name,
            description: payload.description,
            enabled: payload.enabled !== false,
            currency: payload.currency,
            shippingAmount: payload.shipping_amount,
        };
        await this.shippingMethodSyncService.syncShippingMethod(ctx, input);
    }

    private async handleShippingMethodDelete(ctx: RequestContext, payload: any) {
        if (!payload.erp_channel_id) throw new Error('erp_channel_id is required');
        if (!payload.code) throw new Error('code is required');
        await this.shippingMethodSyncService.removeShippingMethodFromChannel(ctx, {
            erpChannelId: payload.erp_channel_id,
            code: payload.code,
        });
    }

    // ---- Promotion ----

    private async handlePromotionSync(ctx: RequestContext, payload: any) {
        if (!payload.erp_promotion_id) throw new Error('erp_promotion_id is required');
        if (!payload.name) throw new Error('name is required');
        if (!payload.currency) throw new Error('currency is required');
        if (!payload.modified) throw new Error('modified is required');
        if (payload.apply_on !== 'transaction' && payload.apply_on !== 'items') {
            throw new Error('apply_on must be "transaction" or "items"');
        }
        if (!Array.isArray(payload.erp_channel_ids)) throw new Error('erp_channel_ids must be an array');
        for (const field of ['min_order_amount', 'discount_amount']) {
            if (!Number.isInteger(payload[field])) throw new Error(`${field} must be an integer in minor units`);
        }
        if (typeof payload.discount_percentage !== 'number') throw new Error('discount_percentage must be a number');
        const input: SyncPromotionInput = {
            erpPromotionId: payload.erp_promotion_id,
            name: payload.name,
            enabled: payload.enabled !== false,
            startsAt: payload.starts_at ? new Date(payload.starts_at) : null,
            endsAt: payload.ends_at ? new Date(payload.ends_at) : null,
            couponCode: payload.coupon_code || undefined,
            usageLimit: payload.usage_limit ?? null,
            perCustomerUsageLimit: payload.per_customer_usage_limit ?? null,
            erpChannelIds: payload.erp_channel_ids,
            currency: payload.currency,
            applyOn: payload.apply_on,
            skus: payload.skus || [],
            itemGroups: payload.item_groups || [],
            brands: payload.brands || [],
            minOrderAmount: payload.min_order_amount,
            discountPercentage: payload.discount_percentage,
            discountAmount: payload.discount_amount,
            modified: new Date(payload.modified),
        };
        await this.promotionSyncService.syncPromotion(ctx, input);
    }

    private async handlePromotionDisable(ctx: RequestContext, payload: any) {
        if (!payload.erp_promotion_id) throw new Error('erp_promotion_id is required');
        if (!payload.modified) throw new Error('modified is required');
        await this.promotionSyncService.disablePromotion(
            ctx,
            payload.erp_promotion_id,
            new Date(payload.modified),
        );
    }

    private async handlePromotionReconcile(ctx: RequestContext, payload: any) {
        if (!Array.isArray(payload.erp_promotion_ids)) throw new Error('erp_promotion_ids must be an array');
        await this.promotionSyncService.reconcilePromotions(ctx, payload.erp_promotion_ids);
    }

    // ---- Tax category ----

    private async handleTaxCategorySync(ctx: RequestContext, payload: any) {
        if (!payload.name) throw new Error('name is required');
        if (typeof payload.rate !== 'number') throw new Error('rate must be a number');
        if (!Array.isArray(payload.erp_channel_ids)) throw new Error('erp_channel_ids must be an array');
        const input: SyncTaxCategoryInput = {
            name: payload.name,
            rate: payload.rate,
            erpChannelIds: payload.erp_channel_ids,
        };
        await this.taxCategorySyncService.syncTaxCategory(ctx, input);
    }

    // ---- Full Sync ----

    private async handleFullSync(ctx: RequestContext, payload: any) {
        Logger.info('Full sync started', 'RabbitMQHandler');

        if (payload.company) {
            await this.handleCompanySync(ctx, payload);
        }

        const tenants = payload.tenants || (payload.tenant ? [payload.tenant] : []);
        for (const tenant of tenants) {
            await this.handleTenantSync(ctx, { company: payload.company, tenant });
            const channels = tenant.channels || [];
            for (const channel of channels) {
                await this.handleChannelSync(ctx, { company: payload.company, tenant, channel });
            }
        }

        if (payload.channel && !payload.tenants) {
            await this.handleChannelSync(ctx, payload);
        }
        if (payload.channels && !payload.tenants) {
            for (const channel of payload.channels) {
                await this.handleChannelSync(ctx, { company: payload.company, tenant: payload.tenant, channel });
            }
        }

        // Products in full sync
        const products = payload.products || [];
        for (const product of products) {
            await this.handleProductSync(ctx, { product });
        }

        Logger.info('Full sync completed', 'RabbitMQHandler');
    }
}
