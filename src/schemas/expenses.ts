import { z } from "zod";

export const ListExpensesSchema = z.object({
  from_date: z
    .string()
    .optional()
    .describe(
      "Start date/time filter, inclusive (ISO 8601, e.g. 2024-01-01 or 2024-01-01T00:00:00.000Z)"
    ),
  to_date: z
    .string()
    .optional()
    .describe(
      "End date/time filter, exclusive (ISO 8601). For pagination, use the expense_date of the last expense from the previous page."
    ),
  count: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(500)
    .describe("Number of expenses to return (max 500)"),
});
