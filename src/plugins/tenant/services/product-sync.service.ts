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
    ) {}

    async syncProduct(ctx: RequestContext, input: SyncProductInput): Promise<Product | undefined> {
        const slug = input.slug || `erp-${input.erpProductId}`;
        let product = await this.findByErpId(ctx, input.erpProductId);

        if (!product) {
            // Create product
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

            // Create variants ONE AT A TIME to avoid option-combination conflict
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
                        // If variant with same option combo exists, update it instead
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
            // Update existing product
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

            // Update/create variants by SKU
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

        // Assign to channels
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

    private async findByErpId(ctx: RequestContext, erpProductId: string): Promise<Product | undefined> {
        const slug = `erp-${erpProductId}`;
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
