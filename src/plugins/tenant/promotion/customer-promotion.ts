import { LanguageCode, PromotionCondition, idsAreEqual } from "@vendure/core";

/**
 * Limits a promotion to one customer, e.g. a personal coupon from coupon.requested
 * (services/coupon-request.service.ts). Reads `order.customer` like Vendure's own customer_group.
 */
export const customerCondition = new PromotionCondition({
  code: "wisko_customer",
  description: [
    { languageCode: LanguageCode.en, value: "Customer is the specified customer" },
  ],
  args: {
    customerId: {
      type: "ID",
      label: [{ languageCode: LanguageCode.en, value: "Customer ID" }],
    },
  },
  check(ctx, order, args) {
    return !!order.customer && idsAreEqual(order.customer.id, args.customerId);
  },
});
