import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../client.js";
import { ListExpensesSchema } from "../schemas/expenses.js";

export function registerExpenseTools(server: McpServer): void {
  server.registerTool(
    "revolut_list_expenses",
    {
      description:
        "List Revolut Business expenses with optional date filters. " +
        "Results are in reverse chronological order by expense_date. " +
        "from_date is inclusive, to_date is exclusive. " +
        "For pagination, pass the expense_date of the last result as to_date. " +
        "Expense states: missing_info, awaiting_review, approved, rejected, " +
        "pending_reimbursement, refund_requested, refunded, reverted.",
      inputSchema: ListExpensesSchema,
    },
    async (input) => {
      try {
        const data = await getClient().listExpenses({
          from: input.from_date,
          to: input.to_date,
          count: input.count,
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
