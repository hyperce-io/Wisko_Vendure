import { Injectable } from "@nestjs/common";
import {
  Channel,
  Logger,
  RequestContext,
  TaxCategory,
  TaxCategoryService,
  TaxRate,
  TaxRateService,
  TransactionalConnection,
  UserInputError,
} from "@vendure/core";
import { In } from "typeorm";
import { SyncTaxCategoryInput } from "../types";

/**
 * Mirrors ERP Item Tax Templates as Vendure tax categories (tax_category.updated), and gives the
 * product sync the same category + rate handling for each variant.
 *
 * A category is named after the ERP template's title ("GST 18%", "Nepal Tax"). Vendure tax
 * categories are platform-wide, so one title is one category for every tenant; the rate is set
 * per tax zone, on the zone each store channel charges tax in. Without a TaxRate for a category
 * and zone Vendure charges 0% there, and ERP (which taxes the order from its own templates) would
 * refuse the order as not reconciling.
 */
@Injectable()
export class TaxCategorySyncService {
  constructor(
    private connection: TransactionalConnection,
    private taxCategoryService: TaxCategoryService,
    private taxRateService: TaxRateService,
  ) {}

  async syncTaxCategory(
    ctx: RequestContext,
    input: SyncTaxCategoryInput,
  ): Promise<void> {
    return this.connection.withTransaction(ctx, async (txCtx) => {
      const category = await this.findOrCreate(txCtx, input.name);
      const channels = input.erpChannelIds.length
        ? await this.connection.getRepository(txCtx, Channel).find({
            where: { customFields: { erpChannelId: In(input.erpChannelIds) } },
            relations: { defaultTaxZone: true },
          })
        : [];
      // A store whose channel does not exist yet gets the rate on its first product sync.
      if (channels.length < input.erpChannelIds.length) {
        Logger.warn(
          `Tax category ${input.name}: ${input.erpChannelIds.length - channels.length} store channel(s) not in Vendure yet`,
          "TaxCategorySync",
        );
      }
      for (const channel of channels) {
        await this.ensureRate(txCtx, category, channel, input.rate);
      }
    });
  }

  async findOrCreate(ctx: RequestContext, name: string): Promise<TaxCategory> {
    const existing = await this.connection
      .getRepository(ctx, TaxCategory)
      .findOne({ where: { name } });
    if (existing) return existing;
    Logger.info(`Created tax category ${name}`, "TaxCategorySync");
    return this.taxCategoryService.create(ctx, { name });
  }

  /** Sets `category` to `rate` % in the channel's default tax zone, creating the TaxRate if needed. */
  async ensureRate(
    ctx: RequestContext,
    category: TaxCategory,
    channel: Channel,
    rate: number,
  ): Promise<void> {
    const zone = channel.defaultTaxZone;
    if (!zone) {
      throw new UserInputError(
        `Channel ${channel.code} has no default tax zone, so ${category.name} cannot be charged there`,
      );
    }
    const zoneRates = await this.connection.getRepository(ctx, TaxRate).find({
      where: { categoryId: category.id, zoneId: zone.id },
      relations: { customerGroup: true },
    });
    const existing = zoneRates.find((taxRate) => !taxRate.customerGroup);
    if (existing) {
      if (existing.value !== rate) {
        await this.taxRateService.update(ctx, { id: existing.id, value: rate });
      }
      return;
    }
    await this.taxRateService.create(ctx, {
      name: `${category.name} (${zone.name})`,
      value: rate,
      enabled: true,
      categoryId: category.id,
      zoneId: zone.id,
    });
    Logger.info(
      `Created tax rate ${category.name} ${rate}% for zone ${zone.name}`,
      "TaxCategorySync",
    );
  }
}
