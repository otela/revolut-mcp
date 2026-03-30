# revolut-mcp

Read-only MCP server for the Revolut Business API. Exposes accounts, transactions, and expenses as tools for AI agent analysis.

Handles OAuth token refresh automatically — just provide your credentials and a refresh token.

## Setup

1. Create a Revolut Business API application and obtain OAuth credentials. See the [API guide](https://developer.revolut.com/docs/business/business-api).

2. Complete the initial OAuth consent flow to get a refresh token.

3. Set environment variables:
   ```
   REVOLUT_CLIENT_ID=your_client_id
   REVOLUT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
   REVOLUT_ISS=https://your-domain.com
   REVOLUT_REFRESH_TOKEN=your_refresh_token
   ```

## Usage

### Claude Desktop / Cursor

Add to your MCP config:

```json
{
  "mcpServers": {
    "revolut": {
      "command": "npx",
      "args": ["-y", "@otela/revolut-mcp"],
      "env": {
        "REVOLUT_CLIENT_ID": "...",
        "REVOLUT_PRIVATE_KEY": "...",
        "REVOLUT_ISS": "...",
        "REVOLUT_REFRESH_TOKEN": "..."
      }
    }
  }
}
```

### Local development

```bash
npm install
npm run dev
```

## Tools

| Tool | Description |
|------|-------------|
| `revolut_list_accounts` | List all business accounts with balances |
| `revolut_get_account` | Get a single account by ID |
| `revolut_list_transactions` | List transactions with date, account, and type filters |
| `revolut_list_expenses` | List expenses with date filters |

## API Reference

- [Revolut Business API](https://developer.revolut.com/docs/business/business-api)
- [Transactions endpoint](https://developer.revolut.com/docs/business/get-transactions)
- [Expenses endpoint](https://developer.revolut.com/docs/business/get-expenses)
