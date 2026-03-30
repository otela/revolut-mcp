#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerTransactionTools } from "./tools/transactions.js";
import { registerExpenseTools } from "./tools/expenses.js";

const server = new McpServer({
  name: "revolut-mcp",
  version: "0.1.0",
});

registerAccountTools(server);
registerTransactionTools(server);
registerExpenseTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
