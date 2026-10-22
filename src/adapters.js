// Platform adapters: normalize Freshdesk (Basic Auth, API key as username),
// Zendesk (Basic Auth, email/token), and Help Scout (OAuth2 client credentials,
// 48hr token, no refresh token — must re-request on expiry) behind one
// consistent tool vocabulary: createTicket, addReply, addNote, updateStatus, listTickets.

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required environment variable: ${name}. See README for setup.`
    );
  }
  return v;
}

async function handleResponse(res, label) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const errMsg =
      res.headers.get("x-bamboohr-error-message") ||
      (data && (data.message || data.description || data.error)) ||
      (Array.isArray(data) && data.join("; ")) ||
      text ||
      res.statusText;
    throw new Error(`${label} failed (HTTP ${res.status}): ${JSON.stringify(errMsg)}`);
  }
  return data;
}

// ---------- Freshdesk ----------
// Auth: Basic Auth, API key as username, "X" as password.
// Note: Freshdesk's free plan has 0 API calls/min — API access requires a paid plan.
// Docs: https://developers.freshdesk.com/api/
export const freshdesk = {
  name: "freshdesk",

  baseUrl() {
    const domain = requireEnv("FRESHDESK_DOMAIN");
    return `https://${domain}.freshdesk.com/api/v2`;
  },

  headers() {
    const apiKey = requireEnv("FRESHDESK_API_KEY");
    const credential = Buffer.from(`${apiKey}:X`).toString("base64");
    return {
      Authorization: `Basic ${credential}`,
      "Content-Type": "application/json",
    };
  },

  async createTicket({ subject, description, email, priority, status, ...rest }) {
    const res = await fetch(`${this.baseUrl()}/tickets`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ subject, description, email, priority, status, ...rest }),
    });
    return handleResponse(res, "Freshdesk createTicket");
  },

  async addReply({ ticketId, body }) {
    const res = await fetch(`${this.baseUrl()}/tickets/${ticketId}/reply`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ body }),
    });
    return handleResponse(res, "Freshdesk addReply");
  },

  async addNote({ ticketId, body, isPrivate = true }) {
    const res = await fetch(`${this.baseUrl()}/tickets/${ticketId}/notes`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ body, private: isPrivate }),
    });
    return handleResponse(res, "Freshdesk addNote");
  },

  async updateStatus({ ticketId, status }) {
    const res = await fetch(`${this.baseUrl()}/tickets/${ticketId}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ status }),
    });
    return handleResponse(res, "Freshdesk updateStatus");
  },

  async listTickets() {
    const res = await fetch(`${this.baseUrl()}/tickets`, {
      method: "GET",
      headers: this.headers(),
    });
    return handleResponse(res, "Freshdesk listTickets");
  },
};

// ---------- Zendesk ----------
// Auth: Basic Auth with "{email}/token:{api_token}", or OAuth bearer token.
// Docs: https://developer.zendesk.com/documentation/ticketing/managing-tickets/creating-and-updating-tickets/
export const zendesk = {
  name: "zendesk",

  baseUrl() {
    const subdomain = requireEnv("ZENDESK_SUBDOMAIN");
    return `https://${subdomain}.zendesk.com/api/v2`;
  },

  headers() {
    const token = process.env.ZENDESK_OAUTH_TOKEN;
    if (token) {
      return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    }
    const email = requireEnv("ZENDESK_EMAIL");
    const apiToken = requireEnv("ZENDESK_API_TOKEN");
    const credential = Buffer.from(`${email}/token:${apiToken}`).toString("base64");
    return { Authorization: `Basic ${credential}`, "Content-Type": "application/json" };
  },

  async createTicket({ subject, comment, requesterEmail, priority, ...rest }) {
    const body = {
      ticket: {
        subject,
        comment: typeof comment === "string" ? { body: comment } : comment,
        requester: requesterEmail ? { email: requesterEmail } : undefined,
        priority,
        ...rest,
      },
    };
    const res = await fetch(`${this.baseUrl()}/tickets.json`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return handleResponse(res, "Zendesk createTicket");
  },

  async addComment({ ticketId, body, isPublic = true }) {
    const res = await fetch(`${this.baseUrl()}/tickets/${ticketId}.json`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ ticket: { comment: { body, public: isPublic } } }),
    });
    return handleResponse(res, "Zendesk addComment");
  },

  async updateStatus({ ticketId, status }) {
    const res = await fetch(`${this.baseUrl()}/tickets/${ticketId}.json`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ ticket: { status } }),
    });
    return handleResponse(res, "Zendesk updateStatus");
  },

  async listTickets() {
    const res = await fetch(`${this.baseUrl()}/tickets.json`, {
      method: "GET",
      headers: this.headers(),
    });
    return handleResponse(res, "Zendesk listTickets");
  },
};

// ---------- Help Scout ----------
// Auth: OAuth2 Client Credentials flow. Token valid 48 hours, no refresh token
// for this flow — must re-request a new token on expiry (tracked here in-memory).
// Docs: https://developer.helpscout.com/mailbox-api/overview/authentication/
let helpScoutTokenCache = { token: null, expiresAt: 0 };

export const helpscout = {
  name: "helpscout",
  baseUrl: "https://api.helpscout.net/v2",

  async getToken() {
    if (helpScoutTokenCache.token && Date.now() < helpScoutTokenCache.expiresAt) {
      return helpScoutTokenCache.token;
    }
    const clientId = requireEnv("HELPSCOUT_APP_ID");
    const clientSecret = requireEnv("HELPSCOUT_APP_SECRET");
    const res = await fetch("https://api.helpscout.net/v2/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const data = await handleResponse(res, "Help Scout OAuth token request");
    helpScoutTokenCache = {
      token: data.access_token,
      // Refresh 5 minutes early to avoid edge-of-expiry failures.
      expiresAt: Date.now() + (data.expires_in - 300) * 1000,
    };
    return helpScoutTokenCache.token;
  },

  async headers() {
    const token = await this.getToken();
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  },

  async createConversation({ subject, customerEmail, customerFirstName, customerLastName, mailboxId, text }) {
    const body = {
      subject,
      mailboxId,
      type: "email",
      status: "active",
      customer: { email: customerEmail, firstName: customerFirstName, lastName: customerLastName },
      threads: [{ type: "customer", customer: { email: customerEmail }, text }],
    };
    const res = await fetch(`${this.baseUrl}/conversations`, {
      method: "POST",
      headers: await this.headers(),
      body: JSON.stringify(body),
    });
    return handleResponse(res, "Help Scout createConversation");
  },

  async addReply({ conversationId, text, isPublic = true }) {
    const res = await fetch(`${this.baseUrl}/conversations/${conversationId}/reply`, {
      method: "POST",
      headers: await this.headers(),
      body: JSON.stringify({ text, type: isPublic ? "customer" : "note" }),
    });
    return handleResponse(res, "Help Scout addReply");
  },

  async updateStatus({ conversationId, status }) {
    const res = await fetch(`${this.baseUrl}/conversations/${conversationId}`, {
      method: "PATCH",
      headers: await this.headers(),
      body: JSON.stringify([{ op: "replace", path: "/status", value: status }]),
    });
    return handleResponse(res, "Help Scout updateStatus");
  },

  async listConversations({ mailboxId } = {}) {
    const qs = mailboxId ? `?mailbox=${mailboxId}` : "";
    const res = await fetch(`${this.baseUrl}/conversations${qs}`, {
      method: "GET",
      headers: await this.headers(),
    });
    return handleResponse(res, "Help Scout listConversations");
  },
};
