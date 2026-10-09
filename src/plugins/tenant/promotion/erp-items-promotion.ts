import {
  LanguageCode,
  OrderLine,
  PromotionCondition,
  PromotionItemAction,
} from "@vendure/core";

/**
 * An ERP Pricing Rule that applies to items, by Item Code, Item Group or Brand.
 *
 * Lines match on what the product sync stores on each variant: the SKU (the ERP item code),
 * `erpItemGroups` (the item's group and every group above it, so a rule on a parent group also
 * covers its child groups, as in ERPNext) and `erpBrand`. Matching on these instead of variant ids
 * means a rule published before its product reaches Vendure still applies once the product does.
 */
export const erpItemsCondition = new PromotionCondition({
  code: "erp_items",
  description: [
    {
      languageCode: LanguageCode.en,
      value: "Order contains ERP items, item groups or brands",
    },
  ],
  args: {
    skus: {
      type: "string",
      list: true,
      label: [{ languageCode: LanguageCode.en, value: "ERP item codes" }],
    },
    itemGroups: {
      type: "string",
      list: true,
      label: [{ languageCode: LanguageCode.en, value: "ERP item groups" }],
    },
    brands: {
      type: "string",
      list: true,
      label: [{ languageCode: LanguageCode.en, value: "ERP brands" }],
    },
  },
  check(ctx, order, args) {
    const isMatch = (line: OrderLine) =>
      args.skus.includes(line.productVariant.sku) ||
      (line.productVariant.customFields.erpItemGroups ?? []).some((group) =>
        args.itemGroups.includes(group),
      ) ||
      args.brands.includes(line.productVariant.customFields.erpBrand ?? "");
    const lineIds = order.lines.filter(isMatch).map((line) => String(line.id));
    return lineIds.length ? { lineIds } : false;
  },
});

/**
 * Discounts the lines erpItemsCondition matched, per unit: a percentage, or a fixed amount capped
 * at the unit price (ERPNext's per-unit Discount Amount). The unit price is tax-inclusive when the
 * channel's prices are, as in Vendure's own products_percentage_discount.
 */
export const erpItemsDiscountAction = new PromotionItemAction({
  code: "erp_items_discount",
  description: [
    { languageCode: LanguageCode.en, value: "Discount matching ERP items" },
  ],
  args: {
    percentage: {
      type: "float",
      label: [{ languageCode: LanguageCode.en, value: "Discount %" }],
    },
    amount: {
      type: "int",
      label: [
        { languageCode: LanguageCode.en, value: "Discount per unit (minor units)" },
      ],
    },
  },
  conditions: [erpItemsCondition],
  execute(ctx, orderLine, args, state) {
    if (!state.erp_items.lineIds.includes(String(orderLine.id))) {
      return 0;
    }
    const unitPrice = ctx.channel.pricesIncludeTax
      ? orderLine.unitPriceWithTax
      : orderLine.unitPrice;
    return args.percentage
      ? -unitPrice * (args.percentage / 100)
      : -Math.min(args.amount, unitPrice);
  },
});
