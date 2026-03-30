import { z } from "zod";

export const GetAccountSchema = z.object({
  account_id: z.string().min(1).describe("The Revolut account ID"),
});
