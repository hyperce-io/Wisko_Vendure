import { LanguageCode, PaymentMethodHandler } from "@vendure/core";
import { randomBytes } from "crypto";

export const WISKO_ERP_PAYMENT_HANDLER_CODE = "wisko-erp-payment-handler";

export const ERP_CASH_PAYMENT_TYPE = "Cash";

export const wiskoErpPaymentHandler = new PaymentMethodHandler({
  code: WISKO_ERP_PAYMENT_HANDLER_CODE,
  description: [
    { languageCode: LanguageCode.en, value: "Wisko ERP payment method" },
  ],
  args: {
    erpType: {
      type: "string",
      required: true,
      defaultValue: ERP_CASH_PAYMENT_TYPE,
      label: [{ languageCode: LanguageCode.en, value: "ERP payment type" }],
      description: [
        {
          languageCode: LanguageCode.en,
          value:
            "Cash payments are authorized and settled later; Bank and General payments settle immediately. Set by ERP sync.",
        },
      ],
      ui: {
        component: "select-form-input",
        options: [{ value: "Cash" }, { value: "Bank" }, { value: "General" }],
      },
    },
  },
  createPayment: async (ctx, order, amount, args, metadata) => ({
    amount,
    state: args.erpType === ERP_CASH_PAYMENT_TYPE ? "Authorized" : "Settled",
    transactionId: randomBytes(8).toString("hex"),
    metadata,
  }),
  settlePayment: async () => ({ success: true }),
  cancelPayment: async () => ({
    success: true,
    metadata: { cancellationDate: new Date().toISOString() },
  }),
});
