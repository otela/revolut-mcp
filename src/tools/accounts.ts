import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../client.js";
import { GetAccountSchema } from "../schemas/accounts.js";

export function registerAccountTools(server: McpServer): void {
  server.registerTool(
    "revolut_list_accounts",
    {
      description:
        "List all Revolut Business accounts. Returns an array of accounts with balances, currencies, and account details.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await getClient().listAccounts();
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

  server.registerTool(
    "revolut_get_account",
    {
      description: "Get details of a single Revolut Business account by ID.",
      inputSchema: GetAccountSchema,
    },
    async (input) => {
      try {
        const data = await getClient().getAccount(input.account_id);
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
