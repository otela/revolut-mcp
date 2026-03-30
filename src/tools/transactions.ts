import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../client.js";
import { ListTransactionsSchema } from "../schemas/transactions.js";

export function registerTransactionTools(server: McpServer): void {
  server.registerTool(
    "revolut_list_transactions",
    {
      description:
        "List Revolut Business transactions with optional filters. " +
        "Results are in reverse chronological order. " +
        "For pagination, pass the created_at of the last result as to_date. " +
        "Valid transaction types: atm, card_payment, card_refund, card_chargeback, card_credit, " +
        "charge, charge_refund, exchange, transfer, loan, fee, refund, topup, topup_return, tax, tax_refund.",
      inputSchema: ListTransactionsSchema,
    },
    async (input) => {
      try {
        const data = await getClient().listTransactions({
          from: input.from_date,
          to: input.to_date,
          count: input.count,
          account: input.account_id,
          type: input.transaction_type,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    }
  );
}
