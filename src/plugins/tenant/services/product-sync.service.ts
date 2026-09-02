import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    ID,
    ProductService,
    ProductVariantService,
    ChannelService,
    Logger,
    Product,
    LanguageCode,
    TransactionalConnection,
    StockLevelService,
    Channel,
} from '@vendure/core';
import { SyncProductInput } from '../types';
import { GlobalFlag } from '@vendure/common/lib/generated-types';
import '../types';

@Injectable()
export class ProductSyncService {
    constructor(
        private productService: ProductService,
        private productVariantService: ProductVariantService,
        private channelService: ChannelService,
        private connection: TransactionalConnection,
        private stockLevelService: StockLevelService,
    ) {}

    async syncProduct(ctx: RequestContext, input: SyncProductInput): Promise<Product | undefined> {
        const slug = (input.slug || `erp-${input.erpProductId}`).toLowerCase();
        let product = await this.findByErpId(ctx, input.erpProductId);

        if (!product) {
            const created = await this.productService.create(ctx, {
                enabled: input.enabled !== false,
                translations: [{
                    languageCode: LanguageCode.en,
                    name: input.name,
                    slug,
                    description: input.description || '',
                }],
            });
            product = created as unknown as Product;
            Logger.info(`Created product: ${input.name} (erp: ${input.erpProductId})`, 'ProductSync');

            if (input.variants?.length) {
                for (const v of input.variants) {
                    try {
                        await this.productVariantService.create(ctx, [{
                            productId: product.id,
                            sku: v.sku,
                            price: v.price ?? 0,
                            stockOnHand: v.stockOnHand ?? 0,
                            trackInventory: v.trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE,
                            enabled: v.enabled !== false,
                            translations: [{ languageCode: LanguageCode.en, name: v.name }],
                        }]);
                        Logger.info(`Created variant: ${v.sku}`, 'ProductSync');
                    } catch (e: any) {
                        const existing = await this.findVariantBySku(ctx, v.sku);
                        if (existing) {
                            await this.productVariantService.update(ctx, [{
                                id: existing.id as ID,
                                sku: v.sku,
                                price: v.price ?? 0,
                                stockOnHand: v.stockOnHand,
                                trackInventory: v.trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE,
                                enabled: v.enabled,
                                translations: [{ languageCode: LanguageCode.en, name: v.name }],
                            }]);
                            Logger.info(`Updated existing variant: ${v.sku}`, 'ProductSync');
                        } else {
                            Logger.warn(`Variant ${v.sku} error: ${e.message}`, 'ProductSync');
                        }
                    }
                }
            }
        } else {
            await this.productService.update(ctx, {
                id: product.id,
                enabled: input.enabled,
                translations: [{
                    languageCode: LanguageCode.en,
                    name: input.name,
                    slug,
                    description: input.description || undefined,
                }],
            });
            Logger.info(`Updated product: ${input.name} (erp: ${input.erpProductId})`, 'ProductSync');

            if (input.variants?.length) {
                for (const v of input.variants) {
                    const existing = await this.findVariantBySku(ctx, v.sku);
                    if (existing) {
                        await this.productVariantService.update(ctx, [{
                            id: existing.id as ID,
                            sku: v.sku,
                            price: v.price ?? 0,
                            stockOnHand: v.stockOnHand,
                            trackInventory: v.trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE,
                            enabled: v.enabled,
                            translations: [{ languageCode: LanguageCode.en, name: v.name }],
                        }]);
                        Logger.info(`Updated variant: ${v.sku}`, 'ProductSync');

                        // Also update stock at channel-specific stock locations
                        if (v.stockOnHand !== undefined) {
                            await this.updateStockForVariantChannels(ctx, existing.id as ID, v.stockOnHand);
                        }
                    } else {
                        try {
                            await this.productVariantService.create(ctx, [{
                                productId: product.id,
                                sku: v.sku,
                                price: v.price ?? 0,
                                stockOnHand: v.stockOnHand ?? 0,
                                trackInventory: v.trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE,
                                enabled: v.enabled !== false,
                                translations: [{ languageCode: LanguageCode.en, name: v.name }],
                            }]);
                            Logger.info(`Created new variant: ${v.sku}`, 'ProductSync');
                        } catch (e: any) {
                            Logger.warn(`Variant ${v.sku} create error: ${e.message}`, 'ProductSync');
                        }
                    }
                }
            }
        }

        if (input.channelCodes?.length && product) {
            await this.assignToChannels(ctx, product.id, input.channelCodes);
        }

        return product;
    }

    async assignToChannels(ctx: RequestContext, productIdOrErpId: ID | string, channelCodes: string[]): Promise<void> {
        let productId: ID;
        if (typeof productIdOrErpId === 'string' && isNaN(Number(productIdOrErpId))) {
            const product = await this.findByErpId(ctx, productIdOrErpId);
            if (!product) {
                Logger.warn(`Product ${productIdOrErpId} not found for channel assignment`, 'ProductSync');
                return;
            }
            productId = product.id;
        } else {
            productId = productIdOrErpId as ID;
        }

        const allChannels = await this.channelService.findAll(ctx);
        for (const code of channelCodes) {
            const channel = allChannels.items.find(c => c.code === code);
            if (channel) {
                try {
                    await this.productService.assignProductsToChannel(ctx, {
                        channelId: channel.id,
                        productIds: [productId],
                    });
                    Logger.info(`Assigned product ${productId} to channel ${code}`, 'ProductSync');
                } catch (e: any) {
                    Logger.warn(`Assign to ${code} failed: ${e.message}`, 'ProductSync');
                }
            } else {
                Logger.warn(`Channel ${code} not found`, 'ProductSync');
            }
        }
    }

    async removeFromChannels(ctx: RequestContext, erpProductId: string, channelCodes: string[]): Promise<void> {
        const product = await this.findByErpId(ctx, erpProductId);
        if (!product) {
            Logger.warn(`Product ${erpProductId} not found`, 'ProductSync');
            return;
        }
        const allChannels = await this.channelService.findAll(ctx);
        for (const code of channelCodes) {
            const channel = allChannels.items.find(c => c.code === code);
            if (channel) {
                await this.productService.removeProductsFromChannel(ctx, {
                    channelId: channel.id,
                    productIds: [product.id],
                });
                Logger.info(`Removed product ${product.id} from channel ${code}`, 'ProductSync');
            }
        }
    }

    async deleteProduct(ctx: RequestContext, erpProductId: string): Promise<void> {
        const product = await this.findByErpId(ctx, erpProductId);
        if (product) {
            await this.productService.softDelete(ctx, product.id);
            Logger.info(`Deleted product: ${erpProductId}`, 'ProductSync');
        }
    }

    async updateStock(ctx: RequestContext, items: Array<{ sku: string; qty: number }>): Promise<void> {
        for (const item of items) {
            const variant = await this.findVariantBySku(ctx, item.sku);
            if (!variant) {
                Logger.warn(`Stock update: variant ${item.sku} not found`, 'ProductSync');
                continue;
            }
            await this.updateStockForVariantChannels(ctx, variant.id as ID, item.qty);
        }
    }

    /**
     * Updates stock only at the stock location of the variant's assigned channel.
     * Each channel has one stock location (excluding default).
     * 
     * Flow: variant → assigned channels (non-default) → stock locations for those channels → update stock there
     */
    private async updateStockForVariantChannels(ctx: RequestContext, variantId: ID, targetQty: number): Promise<void> {
        // Get variant's assigned channels (exclude default)
        const channelRows = await this.connection.rawConnection.query(
            `SELECT c.id FROM product_variant_channels_channel pvcc
             JOIN channel c ON c.id = pvcc."channelId"
             WHERE pvcc."productVariantId" = $1 AND c.code != '__default_channel__'`,
            [variantId],
        );

        if (channelRows.length === 0) {
            // Only in default channel — update via variant service
            await this.productVariantService.update(ctx, [{ id: variantId, stockOnHand: targetQty }]);
            Logger.info(`Stock set (default only): variant ${variantId} → ${targetQty}`, 'ProductSync');
            return;
        }

        const channelIds = channelRows.map((r: any) => r.id);

        // Get stock locations for those channels (exclude default stock location id=1)
        const locationRows = await this.connection.rawConnection.query(
            `SELECT DISTINCT sl.id FROM stock_location sl
             JOIN stock_location_channels_channel slc ON slc."stockLocationId" = sl.id
             WHERE slc."channelId" = ANY($1) AND sl.id != 1`,
            [channelIds],
        );

        if (locationRows.length === 0) {
            await this.productVariantService.update(ctx, [{ id: variantId, stockOnHand: targetQty }]);
            Logger.info(`Stock set (no channel location): variant ${variantId} → ${targetQty}`, 'ProductSync');
            return;
        }

        for (const row of locationRows) {
            const level = await this.stockLevelService.getStockLevel(ctx, variantId, row.id);
            const currentQty = level?.stockOnHand ?? 0;
            const delta = targetQty - currentQty;
            if (delta !== 0) {
                await this.stockLevelService.updateStockOnHandForLocation(ctx, variantId, row.id, delta);
            }
        }
        Logger.info(`Stock updated: variant ${variantId} → ${targetQty} (${locationRows.length} location${locationRows.length > 1 ? 's' : ''})`, 'ProductSync');
    }

    // ---- Helpers ----

    private async findByErpId(ctx: RequestContext, erpProductId: string): Promise<Product | undefined> {
        const slug = `erp-${erpProductId}`.toLowerCase();
        const result = await this.productService.findOneBySlug(ctx, slug);
        if (result) return result as unknown as Product;
        const { items } = await this.productService.findAll(ctx, {
            filter: { slug: { eq: slug } },
            take: 1,
        });
        return items[0] as unknown as Product | undefined;
    }

    private async findVariantBySku(ctx: RequestContext, sku: string) {
        const { items } = await this.productVariantService.findAll(ctx, {
            filter: { sku: { eq: sku } },
            take: 1,
        });
        return items[0] || null;
    }
}
