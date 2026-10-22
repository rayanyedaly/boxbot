// lib/agent/tools.ts
//
// Tool surface for the support inbox agent. Designed so the agent MUST chain tools
// to resolve a ticket — e.g. "where's my refund?" needs:
//   search_customer -> get_customer_context -> search_orders
//   -> search_knowledge_base (refund policy) -> draft_reply | escalate_ticket
// That chaining is the orchestration proof. Keep it.
//
// Two exports the loop consumes:
//   - toolDefinitions: the `tools` array passed to the Anthropic Messages API
//   - toolHandlers:    name -> async (input) => JSON-serializable result
//
// Handlers return plain objects. The loop JSON.stringifies them into tool_result
// blocks and feeds them back to the model. Keep results lean — every token a tool
// returns is a token the model pays to read on the next turn (and that you log).

import type Anthropic from "@anthropic-ai/sdk";
// Relative (not "@/lib/prisma") so the tsx runners resolve it. One shared client means
// a harness that points DATABASE_URL at another DB (evals) moves every query with it.
import { prisma } from "../prisma";
import { searchKb } from "./kb-search";

// --- API-facing definitions ------------------------------------------------

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "search_customer",
    description:
      "Resolve a customer by free-text query (name, email, or both; every word must match). Use this first " +
      "when a ticket references a person but you only have a ticketId. Returns up to a " +
      "few candidate matches with their ids; pick the best and use get_customer_context " +
      "for the full picture.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Name fragment or email to search for.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_customer_context",
    description:
      "Get a customer's profile, plan, and a lightweight summary of recent activity " +
      "(order count, open ticket count). Use after you have a customerId to ground a " +
      "reply in who this person is.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "string" },
      },
      required: ["customerId"],
    },
  },
  {
    name: "search_orders",
    description:
      "List a customer's orders, newest first, optionally filtered by status " +
      "(PAID, REFUNDED, PENDING, FAILED). Use for billing, refund, and 'where's my order' " +
      "questions. Returns amounts and dates. createdAt is when the order was placed; a " +
      "REFUNDED order has no separate refund date.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        status: {
          type: "string",
          enum: ["PAID", "REFUNDED", "PENDING", "FAILED"],
          description: "Optional status filter.",
        },
        limit: { type: "integer", description: "Max rows (default 10)." },
      },
      required: ["customerId"],
    },
  },
  {
    name: "search_knowledge_base",
    description:
      "Search internal policy / how-to articles by keywords (any word may match; best " +
      "matches first). ALWAYS consult this before asserting a policy (refunds, cancellations, SLAs) so replies are grounded in real " +
      "docs rather than guessed. Returns matching article titles and bodies.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", description: "Max articles (default 3)." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_ticket_history",
    description:
      "Return the customer's prior tickets (subject, status, created date) for context " +
      "on whether this is a recurring or escalating issue. Does not include full message " +
      "bodies — use it to decide if deeper context or escalation is warranted.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        limit: { type: "integer", description: "Max tickets (default 5)." },
      },
      required: ["customerId"],
    },
  },
  {
    name: "draft_reply",
    description:
      "Stage a reply to the customer on this ticket. The reply is saved as a DRAFT and is " +
      "NOT sent — a human support agent reviews and approves it. Use this once you have " +
      "enough grounded context to answer. Write the full customer-facing message body.",
    input_schema: {
      type: "object",
      properties: {
        ticketId: { type: "string" },
        body: {
          type: "string",
          description: "The full reply text the customer would receive.",
        },
      },
      required: ["ticketId", "body"],
    },
  },
  {
    name: "update_ticket",
    description:
      "Triage the ticket: set status, priority, and/or tags. RESOLVED when your draft fully " +
      "answers the customer; PENDING only when your draft asks them for information you need " +
      "before you can help. Tags are added to the ticket's existing tags and don't notify anyone. " +
      "An escalated ticket's status can't be changed.",
    input_schema: {
      type: "object",
      properties: {
        ticketId: { type: "string" },
        status: {
          type: "string",
          enum: ["OPEN", "PENDING", "RESOLVED", "ESCALATED"],
        },
        priority: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
        },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["ticketId"],
    },
  },
  {
    name: "escalate_ticket",
    description:
      "Escalate to a human team when the knowledge base says that team handles the case, the " +
      "issue is high-risk (security incidents, fraud or disputes, legal), or you lack the " +
      "tools to resolve it. Don't escalate when the knowledge base says no escalation is needed " +
      "(e.g. it tells you to answer or decline the request yourself). Sets the ticket to ESCALATED and records the reason and target " +
      "team. Prefer this over guessing on anything sensitive.",
    input_schema: {
      type: "object",
      properties: {
        ticketId: { type: "string" },
        reason: { type: "string" },
        team: {
          type: "string",
          enum: ["billing", "trust_and_safety", "engineering", "success"],
        },
      },
      required: ["ticketId", "reason", "team"],
    },
  },
];

// --- Handlers --------------------------------------------------------------
// Each returns a lean, JSON-serializable object. Replace TODOs as you wire real
// search; the Prisma sketches below are the intended shape, not final.

type ToolHandler = (input: any) => Promise<unknown>;

export const toolHandlers: Record<string, ToolHandler> = {
  async search_customer({ query }) {
    // The model often passes name and email together ("Omar Haddad omar@x.com"), which
    // as one substring matches nothing. Split into terms; each must match the name or
    // the email.
    const terms = String(query ?? "").split(/[\s,;<>"()]+/).filter(Boolean);
    if (terms.length === 0) return { matches: [] };
    const matches = await prisma.customer.findMany({
      where: {
        AND: terms.map((t) => ({
          OR: [
            { name: { contains: t, mode: "insensitive" as const } },
            { email: { contains: t, mode: "insensitive" as const } },
          ],
        })),
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 5,
      select: { id: true, name: true, email: true, plan: true },
    });
    return { matches };
  },

  async get_customer_context({ customerId }) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, email: true, plan: true, createdAt: true },
    });
    if (!customer) return { error: "customer_not_found" };

    const [orderCount, openTickets] = await Promise.all([
      prisma.order.count({ where: { customerId } }),
      prisma.ticket.count({ where: { customerId, status: "OPEN" } }),
    ]);
    return { customer, orderCount, openTickets };
  },

  async search_orders({ customerId, status, limit = 10 }) {
    const orders = await prisma.order.findMany({
      where: { customerId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        amountUsd: true,
        description: true,
        createdAt: true,
      },
    });
    return { orders };
  },

  async search_knowledge_base({ query, limit }) {
    // Ranked full-text search; see lib/agent/kb-search.ts. Keep results short — bodies
    // are read by the model on the next turn and you pay for those tokens.
    return { articles: await searchKb(String(query ?? ""), limit) };
  },

  async get_ticket_history({ customerId, limit = 5 }) {
    const tickets = await prisma.ticket.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        subject: true,
        status: true,
        priority: true,
        createdAt: true,
      },
    });
    return { tickets };
  },

  async draft_reply({ ticketId, body }) {
    // HITL: stage as DRAFT, never SENT. A human approves to send.
    const draft = await prisma.message.create({
      data: { ticketId, role: "AI", body, status: "DRAFT" },
      select: { id: true, status: true },
    });
    return { draftId: draft.id, status: draft.status, staged: true };
  },

  async update_ticket({ ticketId, status, priority, tags }) {
    const current = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { status: true, tags: true } });
    if (!current) return { error: "ticket_not_found" };
    // An escalation hands the ticket to a team; only a human moves it back out.
    if (current.status === "ESCALATED" && status && status !== "ESCALATED") {
      return { error: "ticket_escalated", message: "This ticket is escalated; its status stays ESCALATED." };
    }
    const ticket = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        // Added to the existing tags, never replacing them — a replace would drop the
        // escalated:<team> tag escalate_ticket records.
        ...(Array.isArray(tags) ? { tags: [...new Set([...current.tags, ...tags.map(String)])] } : {}),
      },
      select: { id: true, status: true, priority: true, tags: true },
    });
    return { ticket };
  },

  async escalate_ticket({ ticketId, reason, team }) {
    const ticket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "ESCALATED", tags: { push: `escalated:${team}` } },
      select: { id: true, status: true },
    });
    return { ticket, reason, team, escalated: true };
  },
};

// Convenience for the loop: run a tool_use block by name, guarding unknown names.
export async function runTool(name: string, input: unknown): Promise<unknown> {
  const handler = toolHandlers[name];
  if (!handler) return { error: `unknown_tool:${name}` };
  try {
    return await handler(input);
  } catch (err) {
    // Return the error as a tool_result so the model can recover/escalate rather
    // than the whole loop throwing.
    return { error: "tool_failed", detail: String(err) };
  }
}
