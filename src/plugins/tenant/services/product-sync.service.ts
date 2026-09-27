import { Injectable } from "@nestjs/common";
import { GlobalFlag } from "@vendure/common/lib/generated-types";
import { normalizeString } from "@vendure/common/lib/normalize-string";
import { unique } from "@vendure/common/lib/unique";
import {
    Channel,
    ChannelService,
    ID,
    idsAreEqual,
    LanguageCode,
    Logger,
    Product,
    ProductOptionGroupService,
    ProductOptionService,
    ProductService,
    ProductVariantService,
    RequestContext,
    StockLevelService,
    StockLocationService,
    TransactionalConnection,
} from "@vendure/core";
import "../types";
import { ProductVariantInput, SyncProductInput } from "../types";

@Injectable()
export class ProductSyncService {
  constructor(
    private productService: ProductService,
    private productVariantService: ProductVariantService,
    private channelService: ChannelService,
    private connection: TransactionalConnection,
    private stockLevelService: StockLevelService,
    private stockLocationService: StockLocationService,
    private productOptionGroupService: ProductOptionGroupService,
    private productOptionService: ProductOptionService,
  ) {}

  /**
   * Creates or updates the product for an ERP item and everything under it — option groups,
   * options, variants, channel assignment, channel prices and stock — in one transaction, so a
   * failure part-way leaves Vendure as it was. A failure is thrown, not logged and skipped: the
   * consumer then dead-letters the message (rabbitmq.consumer.ts) instead of acknowledging a
   * sync that only half happened.
   */
  async syncProduct(
    ctx: RequestContext,
    input: SyncProductInput,
  ): Promise<Product> {
    return this.connection.withTransaction(ctx, async (txCtx) => {
      const slug = (input.slug || `erp-${input.erpProductId}`).toLowerCase();
      const product = await this.upsertProduct(txCtx, input, slug);
      const variants = input.variants || [];

      const optionIdsByKey = await this.ensureVariantOptions(
        txCtx,
        product.id,
        input.erpProductId,
        variants,
      );
      const variantIdsBySku = await this.upsertVariants(
        txCtx,
        product.id,
        variants,
        optionIdsByKey,
      );

      if (input.channelCodes?.length) {
        const channels = await this.assignToChannels(
          txCtx,
          product.id,
          input.channelCodes,
        );
        // After the assignment, which re-copies the default channel's price into each channel.
        await this.applyChannelPrices(
          txCtx,
          variants,
          variantIdsBySku,
          channels,
        );
      }

      for (const variantInput of variants) {
        const variantId = variantIdsBySku.get(variantInput.sku);
        if (variantId && variantInput.stockOnHand !== undefined) {
          await this.updateStockForVariantChannels(
            txCtx,
            variantId,
            variantInput.stockOnHand,
          );
        }
      }
      return product;
    });
  }

  private async upsertProduct(
    ctx: RequestContext,
    input: SyncProductInput,
    slug: string,
  ): Promise<Product> {
    const existing = await this.findByErpId(ctx, input.erpProductId);
    if (!existing) {
      const created = await this.productService.create(ctx, {
        enabled: input.enabled !== false,
        translations: [
          {
            languageCode: LanguageCode.en,
            name: input.name,
            slug,
            description: input.description || "",
          },
        ],
      });
      Logger.info(
        `Created product: ${input.name} (erp: ${input.erpProductId})`,
        "ProductSync",
      );
      return created;
    }
    await this.productService.update(ctx, {
      id: existing.id,
      enabled: input.enabled,
      translations: [
        {
          languageCode: LanguageCode.en,
          name: input.name,
          slug,
          description: input.description || undefined,
        },
      ],
    });
    Logger.info(
      `Updated product: ${input.name} (erp: ${input.erpProductId})`,
      "ProductSync",
    );
    return existing;
  }

  /**
   * Updates the product's variants that already exist (matched by SKU within this product) and
   * creates the rest. Returns every variant's id by SKU.
   */
  private async upsertVariants(
    ctx: RequestContext,
    productId: ID,
    variants: ProductVariantInput[],
    optionIdsByKey: Map<string, ID>,
  ): Promise<Map<string, ID>> {
    const { items: existingVariants } =
      await this.productVariantService.getVariantsByProductId(
        ctx,
        productId,
        {},
        ["options"],
      );
    const variantIdsBySku = new Map<string, ID>();

    for (const variantInput of variants) {
      const optionIds = (variantInput.options || [])
        .map((option) =>
          optionIdsByKey.get(
            this.getOptionKey(option.group, normalizeString(option.value, "-")),
          ),
        )
        .filter((id): id is ID => id != null);
      const trackInventory = variantInput.trackInventory
        ? GlobalFlag.TRUE
        : GlobalFlag.FALSE;
      const translations = [
        { languageCode: LanguageCode.en, name: variantInput.name },
      ];
      const existing = existingVariants.find(
        (variant) => variant.sku === variantInput.sku,
      );

      if (existing) {
        const currentOptionIds = existing.options.map((option) => option.id);
        await this.productVariantService.update(ctx, [
          {
            id: existing.id,
            sku: variantInput.sku,
            // No ERP price means "keep what Vendure has", not 0.
            ...(variantInput.price != null
              ? { price: variantInput.price }
              : {}),
            // Only when they differ: a variant synced before options were sent has none.
            ...(optionIds.length && !this.sameIds(optionIds, currentOptionIds)
              ? { optionIds }
              : {}),
            stockOnHand: variantInput.stockOnHand,
            trackInventory,
            enabled: variantInput.enabled,
            translations,
          },
        ]);
        variantIdsBySku.set(variantInput.sku, existing.id);
        Logger.info(`Updated variant: ${variantInput.sku}`, "ProductSync");
      } else {
        const [created] = await this.productVariantService.create(ctx, [
          {
            productId,
            sku: variantInput.sku,
            price: variantInput.price ?? 0,
            optionIds,
            stockOnHand: variantInput.stockOnHand ?? 0,
            trackInventory,
            enabled: variantInput.enabled !== false,
            translations,
          },
        ]);
        variantIdsBySku.set(variantInput.sku, created.id);
        Logger.info(`Created variant: ${variantInput.sku}`, "ProductSync");
      }
    }
    return variantIdsBySku;
  }

  /**
   * Makes sure the product has an option group for every ERP attribute its variants use, and an
   * option for every value. Returns every option's id, keyed by getOptionKey.
   *
   * Vendure tells a product's variants apart by their options: it refuses a variant whose options
   * match an existing one's, so a multi-variant product needs them. A variant with no options (a
   * standalone ERP item) gets none, and the product no option groups.
   *
   * Groups are coded per product (`erp-<erpProductId>-<attribute>`), not shared across products, so
   * a change to one product's options never reaches another's. The ERP id is used rather than the
   * slug because the slug can change, which would leave the old groups behind and create new ones.
   * Adding a group to a product that already has variants is allowed; upsertVariants then gives
   * those variants their option.
   */
  private async ensureVariantOptions(
    ctx: RequestContext,
    productId: ID,
    erpProductId: string,
    variants: ProductVariantInput[],
  ): Promise<Map<string, ID>> {
    const variantOptions = variants.flatMap(
      (variantInput) => variantInput.options || [],
    );
    const optionIdsByKey = new Map<string, ID>();
    if (!variantOptions.length) return optionIdsByKey;

    const productGroups =
      await this.productOptionGroupService.getOptionGroupsByProductId(
        ctx,
        productId,
      );

    for (const group of unique(variantOptions.map((option) => option.group))) {
      const groupOptions = variantOptions.filter(
        (option) => option.group === group,
      );
      const groupCode = normalizeString(`erp-${erpProductId}-${group}`, "-");
      let optionGroup = productGroups.find(
        (productGroup) => productGroup.code === groupCode,
      );
      if (!optionGroup) {
        optionGroup = await this.productOptionGroupService.create(ctx, {
          code: groupCode,
          translations: [
            {
              languageCode: LanguageCode.en,
              name: groupOptions[0].groupName || group,
            },
          ],
        });
        await this.productService.addOptionGroupToProduct(
          ctx,
          productId,
          optionGroup.id,
        );
        Logger.info(`Created option group: ${groupCode}`, "ProductSync");
      }

      for (const existingOption of optionGroup.options || []) {
        if (!existingOption.deletedAt) {
          optionIdsByKey.set(
            this.getOptionKey(group, existingOption.code),
            existingOption.id,
          );
        }
      }
      for (const option of groupOptions) {
        const optionCode = normalizeString(option.value, "-");
        const optionKey = this.getOptionKey(group, optionCode);
        if (optionIdsByKey.has(optionKey)) continue;
        const created = await this.productOptionService.create(
          ctx,
          optionGroup.id,
          {
            code: optionCode,
            translations: [
              { languageCode: LanguageCode.en, name: option.value },
            ],
          },
        );
        optionIdsByKey.set(optionKey, created.id);
      }
    }
    return optionIdsByKey;
  }

  /** Option codes are only unique within their group, so the key carries both. */
  private getOptionKey(group: string, optionCode: string): string {
    return `${group}:${optionCode}`;
  }

  /**
   * Sets each variant's price in each channel from the ERP `prices` entry in that channel's own
   * currency. A channel with no ERP price in its currency keeps the price the assignment copied.
   */
  private async applyChannelPrices(
    ctx: RequestContext,
    variants: ProductVariantInput[],
    variantIdsBySku: Map<string, ID>,
    channels: Channel[],
  ): Promise<void> {
    for (const variantInput of variants) {
      const variantId = variantIdsBySku.get(variantInput.sku);
      if (!variantId || !variantInput.prices?.length) continue;
      for (const channel of channels) {
        const channelPrice = variantInput.prices.find(
          (price) => price.currencyCode === channel.defaultCurrencyCode,
        );
        if (!channelPrice) continue;
        await this.productVariantService.createOrUpdateProductVariantPrice(
          ctx,
          variantId,
          channelPrice.amount,
          channel.id,
          channel.defaultCurrencyCode,
        );
      }
    }
  }

  private sameIds(expectedIds: ID[], currentIds: ID[]): boolean {
    return (
      expectedIds.length === currentIds.length &&
      expectedIds.every((expectedId) =>
        currentIds.some((currentId) => idsAreEqual(expectedId, currentId)),
      )
    );
  }

  /** Assigns the product to each channel found by code, and returns those channels. */
  async assignToChannels(
    ctx: RequestContext,
    productIdOrErpId: ID | string,
    channelCodes: string[],
  ): Promise<Channel[]> {
    let productId: ID;
    if (
      typeof productIdOrErpId === "string" &&
      isNaN(Number(productIdOrErpId))
    ) {
      const product = await this.findByErpId(ctx, productIdOrErpId);
      if (!product) {
        Logger.warn(
          `Product ${productIdOrErpId} not found for channel assignment`,
          "ProductSync",
        );
        return [];
      }
      productId = product.id;
    } else {
      productId = productIdOrErpId as ID;
    }

    const allChannels = await this.channelService.findAll(ctx);
    const assigned: Channel[] = [];
    for (const code of channelCodes) {
      const channel = allChannels.items.find((c) => c.code === code);
      if (channel) {
        await this.productService.assignProductsToChannel(ctx, {
          channelId: channel.id,
          productIds: [productId],
        });
        assigned.push(channel);
        Logger.info(
          `Assigned product ${productId} to channel ${code}`,
          "ProductSync",
        );
      } else {
        Logger.warn(`Channel ${code} not found`, "ProductSync");
      }
    }
    return assigned;
  }

  async removeFromChannels(
    ctx: RequestContext,
    erpProductId: string,
    channelCodes: string[],
  ): Promise<void> {
    const product = await this.findByErpId(ctx, erpProductId);
    if (!product) {
      Logger.warn(`Product ${erpProductId} not found`, "ProductSync");
      return;
    }
    const allChannels = await this.channelService.findAll(ctx);
    for (const code of channelCodes) {
      const channel = allChannels.items.find((c) => c.code === code);
      if (channel) {
        await this.productService.removeProductsFromChannel(ctx, {
          channelId: channel.id,
          productIds: [product.id],
        });
        Logger.info(
          `Removed product ${product.id} from channel ${code}`,
          "ProductSync",
        );
      }
    }
  }

  async deleteProduct(
    ctx: RequestContext,
    erpProductId: string,
  ): Promise<void> {
    const product = await this.findByErpId(ctx, erpProductId);
    if (product) {
      await this.productService.softDelete(ctx, product.id);
      Logger.info(`Deleted product: ${erpProductId}`, "ProductSync");
    }
  }

  async updateStock(
    ctx: RequestContext,
    items: Array<{ sku: string; qty: number }>,
  ): Promise<void> {
    for (const item of items) {
      const variant = await this.findVariantBySku(ctx, item.sku);
      if (!variant) {
        Logger.warn(
          `Stock update: variant ${item.sku} not found`,
          "ProductSync",
        );
        continue;
      }
      await this.updateStockForVariantChannels(ctx, variant.id as ID, item.qty);
    }
  }

  /**
   * Updates stock only at the stock location belonging to the variant's assigned channel.
   *
   * Flow:
   * 1. Get variant's channels (exclude default)
   * 2. Get all stock levels for the variant
   * 3. For each stock level, load its stock location with channels
   * 4. If any of the location's channels match the variant's channels (non-default) → update
   */
  private async updateStockForVariantChannels(
    ctx: RequestContext,
    variantId: ID,
    targetQty: number,
  ): Promise<void> {
    // 1. Get variant's assigned channels (non-default)
    const variant = await this.productVariantService.findOne(ctx, variantId, [
      "channels",
    ]);
    if (!variant) return;

    const variantChannelIds = new Set(
      (variant.channels || [])
        .filter((c) => c.code !== "__default_channel__")
        .map((c) => String(c.id)),
    );

    if (variantChannelIds.size === 0) {
      // Only in default channel
      await this.productVariantService.update(ctx, [
        { id: variantId, stockOnHand: targetQty },
      ]);
      Logger.info(
        `Stock set (default only): variant ${variantId} → ${targetQty}`,
        "ProductSync",
      );
      return;
    }

    // 2. Get all stock levels for this variant
    const stockLevels = await this.stockLevelService.getStockLevelsForVariant(
      ctx,
      variantId,
    );
    let updatedCount = 0;

    for (const level of stockLevels) {
      // 3. Load stock location with its channels
      const location = await this.stockLocationService.findOne(
        ctx,
        level.stockLocationId,
      );
      if (!location) continue;

      // Hydrate channels on the location
      const locationWithChannels = await this.connection
        .getRepository(ctx, location.constructor as any)
        .findOne({ where: { id: location.id }, relations: { channels: true } });
      if (!locationWithChannels) continue;

      // 4. Check if this location belongs to any of the variant's channels (non-default)
      const locationChannelIds = (locationWithChannels.channels || []).map(
        (c: any) => String(c.id),
      );
      const isMatchingChannel = locationChannelIds.some((id: string) =>
        variantChannelIds.has(id),
      );

      if (isMatchingChannel) {
        const currentQty = level.stockOnHand ?? 0;
        const delta = targetQty - currentQty;
        if (delta !== 0) {
          await this.stockLevelService.updateStockOnHandForLocation(
            ctx,
            variantId,
            level.stockLocationId,
            delta,
          );
        }
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      Logger.info(
        `Stock updated: variant ${variantId} → ${targetQty} (${updatedCount} location${updatedCount > 1 ? "s" : ""})`,
        "ProductSync",
      );
    } else {
      // Fallback
      await this.productVariantService.update(ctx, [
        { id: variantId, stockOnHand: targetQty },
      ]);
      Logger.info(
        `Stock set (fallback): variant ${variantId} → ${targetQty}`,
        "ProductSync",
      );
    }
  }

  // ---- Helpers ----

  private async findByErpId(
    ctx: RequestContext,
    erpProductId: string,
  ): Promise<Product | undefined> {
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
