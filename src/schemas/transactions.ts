import { z } from "zod";

export const ListTransactionsSchema = z.object({
  from_date: z
    .string()
    .optional()
    .describe(
      "Start date/time filter (ISO 8601, e.g. 2024-01-01 or 2024-01-01T00:00:00.000Z)"
    ),
  to_date: z
    .string()
    .optional()
    .describe(
      "End date/time filter (ISO 8601). For pagination, use the created_at value of the last transaction from the previous page."
    ),
  count: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(1000)
    .describe("Number of transactions to return (max 1000)"),
  account_id: z
    .string()
    .optional()
    .describe("Filter by account ID"),
  transaction_type: z
    .enum([
      "atm",
      "card_payment",
      "card_refund",
      "card_chargeback",
      "card_credit",
      "charge",
      "charge_refund",
      "exchange",
      "transfer",
      "loan",
      "fee",
      "refund",
      "topup",
      "topup_return",
      "tax",
      "tax_refund",
    ])
    .optional()
    .describe("Filter by transaction type"),
});
