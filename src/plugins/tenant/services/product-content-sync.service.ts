import { Injectable } from "@nestjs/common";
import {
  DeletionResult,
  UpdateProductVariantInput,
} from "@vendure/common/lib/generated-types";
import { normalizeString } from "@vendure/common/lib/normalize-string";
import { DEFAULT_CHANNEL_CODE } from "@vendure/common/lib/shared-constants";
import {
  Asset,
  AssetService,
  Channel,
  ID,
  idsAreEqual,
  isGraphQlErrorResult,
  Logger,
  Product,
  ProductService,
  ProductVariant,
  ProductVariantService,
  RequestContext,
  TransactionalConnection,
} from "@vendure/core";
import path from "path";
import { Readable } from "stream";
import {
  ProductContentFieldsInput,
  ProductContentSeoInput,
  ProductVariantContentInput,
  SyncProductContentInput,
} from "../types";
import { ProductSyncService } from "./product-sync.service";

const DOWNLOAD_TIMEOUT_MS = 120_000;

interface VariantTarget {
  id: ID;
  content: ProductVariantContentInput;
}

@Injectable()
export class ProductContentSyncService {
  constructor(
    private connection: TransactionalConnection,
    private productService: ProductService,
    private productVariantService: ProductVariantService,
    private assetService: AssetService,
    private productSyncService: ProductSyncService,
  ) {}

  /**
   * Writes Strapi's content onto the ERP product and its variants, in the message's language.
   * A product or SKU Vendure does not have yet is thrown, so the consumer dead-letters the message
   * for a replay after the ERP sync. Files are stored before the transaction, each saved whole, so
   * a failed update leaves no orphan files and the replay reuses the ones already stored.
   */
  async syncProductContent(
    ctx: RequestContext,
    input: SyncProductContentInput,
  ): Promise<void> {
    const product = await this.productSyncService.findByErpId(
      ctx,
      input.erpProductId,
    );
    if (!product) {
      throw new Error(
        `Product ${input.erpProductId} not found; the ERP has not synced it yet`,
      );
    }
    const variantTargets = await this.findVariantTargets(
      ctx,
      product.id,
      input,
    );
    const productChannels = await this.productService.getProductChannels(
      ctx,
      product.id,
    );
    const storeChannels = productChannels.filter(
      (channel) => channel.code !== DEFAULT_CHANNEL_CODE,
    );

    const replacedAssets = await this.findReplacedStrapiAssets(
      ctx,
      product.id,
      input,
      variantTargets,
    );
    const productAssets = await this.storeAssets(ctx, input, storeChannels);
    const variantUpdates: UpdateProductVariantInput[] = [];
    for (const { id, content } of variantTargets) {
      const variantAssets = await this.storeAssets(ctx, content, storeChannels);
      variantUpdates.push({
        id,
        ...variantAssets,
        translations: [
          {
            languageCode: input.languageCode,
            name: content.title,
            customFields: {
              description: content.description,
              shortDescription: content.shortDescription,
              ...this.toSeoFields(content.seo),
            },
          },
        ],
        customFields: this.toSpecsField(content),
      });
    }

    await this.connection.withTransaction(ctx, async (txCtx) => {
      await this.productService.update(txCtx, {
        id: product.id,
        ...productAssets,
        translations: [
          {
            languageCode: input.languageCode,
            name: input.title,
            slug: normalizeString(`erp-${input.erpProductId}`, "-"),
            description: input.description,
            customFields: {
              shortDescription: input.shortDescription,
              ...this.toSeoFields(input.seo),
            },
          },
        ],
        customFields: this.toSpecsField(input),
      });
      if (variantUpdates.length) {
        await this.productVariantService.update(txCtx, variantUpdates);
      }
    });
    Logger.info(
      `Applied ${input.languageCode} content to product ${input.erpProductId} and ${variantUpdates.length} variants`,
      "ProductContentSync",
    );
    await this.deleteDroppedAssets(ctx, replacedAssets, [
      ...(productAssets.assetIds ?? []),
      ...variantUpdates.flatMap((update) => update.assetIds ?? []),
    ]);
  }

  /**
   * The Strapi files the product and its variants show now, for each whose media this message
   * replaces. Assets added in Vendure itself have no sourceUrl and are never touched.
   */
  private async findReplacedStrapiAssets(
    ctx: RequestContext,
    productId: ID,
    input: SyncProductContentInput,
    variantTargets: VariantTarget[],
  ): Promise<Asset[]> {
    const entities = await Promise.all([
      ...(input.images !== undefined
        ? [this.connection.getEntityOrThrow(ctx, Product, productId)]
        : []),
      ...variantTargets
        .filter(({ content }) => content.images !== undefined)
        .map(({ id }) =>
          this.connection.getEntityOrThrow(ctx, ProductVariant, id),
        ),
    ]);
    const assetLists = await Promise.all(
      entities.map((entity) =>
        this.assetService.getEntityAssets(ctx, entity),
      ),
    );
    return assetLists
      .flatMap((assets) => assets ?? [])
      .filter((asset) => asset.customFields.sourceUrl);
  }

  /**
   * A Strapi file the product no longer shows — deleted or swapped in Strapi — is deleted from
   * Vendure too, with its stored file. Vendure's own delete refuses while another product, variant
   * or collection still uses it, so a file shared elsewhere stays.
   */
  private async deleteDroppedAssets(
    ctx: RequestContext,
    replacedAssets: Asset[],
    keptAssetIds: ID[],
  ): Promise<void> {
    const droppedAssets = new Map(
      replacedAssets
        .filter(
          (asset) => !keptAssetIds.some((id) => idsAreEqual(id, asset.id)),
        )
        .map((asset) => [asset.id, asset]),
    );
    for (const asset of droppedAssets.values()) {
      const deletion = await this.assetService.delete(
        ctx,
        [asset.id],
        false,
        true,
      );
      if (deletion.result === DeletionResult.DELETED) {
        Logger.info(
          `Deleted asset ${asset.id} (${asset.customFields.sourceUrl}), no longer in Strapi content`,
          "ProductContentSync",
        );
      } else {
        Logger.verbose(
          `Kept asset ${asset.id}: ${deletion.message}`,
          "ProductContentSync",
        );
      }
    }
  }

  private async findVariantTargets(
    ctx: RequestContext,
    productId: ID,
    input: SyncProductContentInput,
  ): Promise<VariantTarget[]> {
    const targets: VariantTarget[] = [];
    for (const content of input.variants) {
      const variant = await this.productSyncService.findVariantBySku(
        ctx,
        content.sku,
      );
      if (!variant || !idsAreEqual(variant.productId, productId)) {
        throw new Error(
          `Variant ${content.sku} of product ${input.erpProductId} not found`,
        );
      }
      targets.push({ id: variant.id, content });
    }
    return targets;
  }

  private toSeoFields(seo: ProductContentSeoInput) {
    return {
      seoTitle: seo.title,
      seoDescription: seo.description,
      seoSchema: seo.schema,
    };
  }

  private toSpecsField(content: ProductContentFieldsInput): { specs?: string } {
    return content.specs === undefined
      ? {}
      : { specs: JSON.stringify(content.specs) };
  }

  /**
   * The entity's assets: its images in order, then its video, which Vendure tells apart by Asset
   * type. The first image is featured, or the video when there is none; an empty list clears both.
   * Nothing when the message leaves the media unchanged.
   */
  private async storeAssets(
    ctx: RequestContext,
    content: ProductContentFieldsInput,
    storeChannels: Channel[],
  ): Promise<{ assetIds?: ID[]; featuredAssetId?: ID }> {
    if (content.images === undefined) return {};
    const fileUrls = content.videoUrl
      ? [...content.images, content.videoUrl]
      : content.images;
    const assetIds: ID[] = [];
    for (const fileUrl of fileUrls) {
      const asset = await this.findOrDownloadAsset(ctx, fileUrl);
      assetIds.push(asset.id);
    }
    if (!assetIds.length) return { assetIds };
    for (const channel of storeChannels) {
      await this.assetService.assignToChannel(ctx, {
        channelId: channel.id,
        assetIds,
      });
    }
    return { assetIds, featuredAssetId: assetIds[0] };
  }

  // Strapi names stored files by content hash, so a URL already downloaded is the same file.
  private async findOrDownloadAsset(
    ctx: RequestContext,
    fileUrl: string,
  ): Promise<Asset> {
    const existing = await this.connection.getRepository(ctx, Asset).findOne({
      where: { customFields: { sourceUrl: fileUrl } },
    });
    if (existing) return existing;

    const response = await fetch(fileUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok || !response.body) {
      throw new Error(
        `Download failed: ${response.status} ${response.statusText} (${fileUrl})`,
      );
    }
    const fileStream = Readable.from(response.body);
    const fileName = path.basename(new URL(fileUrl).pathname);
    const asset = await this.connection.withTransaction(ctx, async (txCtx) => {
      const created = await this.assetService.createFromFileStream(
        fileStream,
        fileName,
        txCtx,
      );
      if (isGraphQlErrorResult(created)) {
        throw new Error(
          `Asset creation failed: ${created.message} (${fileUrl})`,
        );
      }
      await this.assetService.update(txCtx, {
        id: created.id,
        customFields: { sourceUrl: fileUrl },
      });
      return created;
    });
    Logger.info(
      `Downloaded asset ${asset.id} from ${fileUrl}`,
      "ProductContentSync",
    );
    return asset;
  }
}
