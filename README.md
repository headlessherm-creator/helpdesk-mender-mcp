# Helpdesk Mender MCP — Zendesk, Freshdesk & Help Scout Write Tools for AI Agents

A free, local MCP server that creates tickets, adds replies and notes, and changes ticket status in **Zendesk**, **Freshdesk**, and **Help Scout** — one consistent tool vocabulary across all three, so you don't hand-roll three different helpdesk integrations.

If you're building an AI support workflow and keep rewriting the same ticket-creation/reply logic for Zendesk's Basic/OAuth auth, Freshdesk's API-key auth, and Help Scout's OAuth2 client-credentials flow, this is the MCP server for that exact problem.

## The problem this solves

Zendesk, Freshdesk, and Help Scout all have solid write-capable ticketing APIs, but each uses a different auth scheme, different field names, and a different notion of what a "ticket" even is (Help Scout calls it a "conversation"). There is no free, open-source tool that normalizes all three behind one set of calls. This is that tool.

## Tools

- **create_ticket** — create a new ticket/conversation.
- **add_reply** — add a public reply, visible to the customer.
- **add_note** — add a private, internal-only note (Freshdesk and Help Scout; Zendesk has no separate note endpoint — use `add_reply` with a non-public comment on that platform directly).
- **update_status** — change ticket/conversation status.
- **list_tickets** — list tickets/conversations.

## Setup

**1. Install Node.js** (v18+): https://nodejs.org

**2. Clone and install:**

```bash
git clone https://github.com/headlessherm-creator/helpdesk-mender-mcp.git
cd helpdesk-mender-mcp
npm install
```

**3. Get API credentials for the platform(s) you use:**

- **Freshdesk:** Get your API key from Profile Settings. **Important:** Freshdesk's free plan has a 0 calls/minute API rate limit — API access requires a paid plan (Growth or above). See [Freshdesk's API docs](https://developers.freshdesk.com/api/).
- **Zendesk:** Create an API token under Admin Center → Apps and integrations → APIs → Zendesk API, or use OAuth. See [Zendesk's API docs](https://developer.zendesk.com/documentation/ticketing/managing-tickets/creating-and-updating-tickets/).
- **Help Scout:** Create an OAuth2 app under Your Profile → My Apps, using the Client Credentials flow. Note: Help Scout's client-credentials tokens expire after 48 hours and have **no refresh token** — this server automatically re-requests a new token when the cached one expires, so you don't need to handle that yourself. See [Help Scout's auth docs](https://developer.helpscout.com/mailbox-api/overview/authentication/).

**4. Set environment variables:**

```bash
export FRESHDESK_DOMAIN=yourcompany
export FRESHDESK_API_KEY=your_api_key
export ZENDESK_SUBDOMAIN=yourcompany
export ZENDESK_EMAIL=you@yourcompany.com
export ZENDESK_API_TOKEN=your_api_token
export HELPSCOUT_APP_ID=your_app_id
export HELPSCOUT_APP_SECRET=your_app_secret
```

You only need to set the variables for the platform(s) you're using.

**5. Point your MCP client at it:**

```json
{
  "mcpServers": {
    "helpdesk-mender": {
      "command": "node",
      "args": ["/path/to/helpdesk-mender-mcp/src/index.js"],
      "env": {
        "FRESHDESK_DOMAIN": "yourcompany",
        "FRESHDESK_API_KEY": "your_api_key"
      }
    }
  }
}
```

Setup docs for common clients:
- Claude Desktop: https://modelcontextprotocol.io/quickstart/user
- Cursor: https://docs.cursor.com/context/model-context-protocol
- Claude Code: https://docs.claude.com/en/docs/claude-code/mcp

## Security note

This server makes real network calls to Zendesk's, Freshdesk's, and Help Scout's APIs using the credentials you provide — unlike a fully local tool, your data does leave your machine, going directly to the helpdesk vendor you're already using. No third party, telemetry, or logging is involved.

## Keywords

Zendesk MCP server, Freshdesk MCP server, Help Scout MCP server, helpdesk MCP server, support ticket automation MCP, customer support AI agent, ticketing system MCP, Claude MCP support tools.

## Related tools

Same local-first philosophy, different problems:
- [polymath-megablaster-mcp](https://github.com/headlessherm-creator/polymath-megablaster-mcp) — deterministic math, date, unit conversion, networking
- [json-mender-mcp](https://github.com/headlessherm-creator/json-mender-mcp) — fix malformed JSON, validate JSON Schema, test regex
- [hiring-mender-mcp](https://github.com/headlessherm-creator/hiring-mender-mcp) — BambooHR + Greenhouse ATS write tools, one vocabulary

## License

MIT
