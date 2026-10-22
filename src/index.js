#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { freshdesk, zendesk, helpscout } from "./adapters.js";

const PLATFORMS = { freshdesk, zendesk, helpscout };

function platformOf(args) {
  const p = args.platform;
  if (!p || !PLATFORMS[p]) {
    throw new Error(
      `"platform" must be one of: ${Object.keys(PLATFORMS).join(", ")}`
    );
  }
  return PLATFORMS[p];
}

const TOOLS = [
  {
    name: "create_ticket",
    description:
      "Create a new ticket/conversation. Freshdesk: subject, description, email. Zendesk: subject, comment (string or {body}), requesterEmail. Help Scout: subject, customerEmail, customerFirstName, customerLastName, mailboxId, text (Help Scout calls this a 'conversation', not a ticket).",
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["freshdesk", "zendesk", "helpscout"] },
        ticket: {
          type: "object",
          description: "Ticket/conversation fields. Field names differ by platform — see tool description.",
        },
      },
      required: ["platform", "ticket"],
    },
  },
  {
    name: "add_reply",
    description:
      "Add a public reply (visible to the customer) to an existing ticket/conversation. Freshdesk: ticketId, body. Zendesk: ticketId, body (adds as a public comment). Help Scout: conversationId, text.",
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["freshdesk", "zendesk", "helpscout"] },
        ticketId: { type: ["string", "number"], description: "Freshdesk/Zendesk" },
        conversationId: { type: ["string", "number"], description: "Help Scout" },
        body: { type: "string", description: "Freshdesk/Zendesk reply text" },
        text: { type: "string", description: "Help Scout reply text" },
      },
      required: ["platform"],
    },
  },
  {
    name: "add_note",
    description:
      "Add a private, internal-only note (not visible to the customer). Freshdesk: ticketId, body. Zendesk: use add_reply with isPublic=false instead (Zendesk has no separate note endpoint). Help Scout: conversationId, text (uses isPublic=false).",
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["freshdesk", "helpscout"] },
        ticketId: { type: ["string", "number"] },
        conversationId: { type: ["string", "number"] },
        body: { type: "string" },
        text: { type: "string" },
      },
      required: ["platform"],
    },
  },
  {
    name: "update_status",
    description:
      "Change a ticket/conversation's status. Freshdesk status codes: 2=Open, 3=Pending, 4=Resolved, 5=Closed. Zendesk: 'new', 'open', 'pending', 'hold', 'solved', 'closed'. Help Scout: 'active', 'pending', 'closed', 'spam'.",
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["freshdesk", "zendesk", "helpscout"] },
        ticketId: { type: ["string", "number"] },
        conversationId: { type: ["string", "number"] },
        status: { type: ["string", "number"] },
      },
      required: ["platform", "status"],
    },
  },
  {
    name: "list_tickets",
    description: "List tickets/conversations for a platform.",
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["freshdesk", "zendesk", "helpscout"] },
        mailboxId: { type: ["string", "number"], description: "Help Scout only" },
      },
      required: ["platform"],
    },
  },
];

const server = new Server(
  { name: "helpdesk-mender-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    switch (name) {
      case "create_ticket": {
        const platform = platformOf(args);
        result = await platform.createTicket(args.ticket);
        break;
      }
      case "add_reply": {
        const platform = platformOf(args);
        if (args.platform === "freshdesk") {
          result = await platform.addReply({ ticketId: args.ticketId, body: args.body });
        } else if (args.platform === "zendesk") {
          result = await platform.addComment({ ticketId: args.ticketId, body: args.body, isPublic: true });
        } else {
          result = await platform.addReply({ conversationId: args.conversationId, text: args.text, isPublic: true });
        }
        break;
      }
      case "add_note": {
        const platform = platformOf(args);
        if (args.platform === "freshdesk") {
          result = await platform.addNote({ ticketId: args.ticketId, body: args.body, isPrivate: true });
        } else if (args.platform === "helpscout") {
          result = await platform.addReply({ conversationId: args.conversationId, text: args.text, isPublic: false });
        } else {
          throw new Error("add_note is not supported for Zendesk. Use add_reply with isPublic=false via the API directly, or route through this server's zendesk.addComment({isPublic:false}).");
        }
        break;
      }
      case "update_status": {
        const platform = platformOf(args);
        if (args.platform === "freshdesk") {
          result = await platform.updateStatus({ ticketId: args.ticketId, status: args.status });
        } else if (args.platform === "zendesk") {
          result = await platform.updateStatus({ ticketId: args.ticketId, status: args.status });
        } else {
          result = await platform.updateStatus({ conversationId: args.conversationId, status: args.status });
        }
        break;
      }
      case "list_tickets": {
        const platform = platformOf(args);
        if (args.platform === "helpscout") {
          result = await platform.listConversations({ mailboxId: args.mailboxId });
        } else {
          result = await platform.listTickets();
        }
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting helpdesk-mender-mcp:", err);
  process.exit(1);
});
