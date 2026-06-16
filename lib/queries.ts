// lib/queries.ts
//
// Reusable read-side aggregations over the LlmCall observability spine. Kept out of
// the page components so the per-ticket readout and the dashboard share one source
// of truth. All Decimal values are converted to number here (server side).

import { prisma } from "./prisma";
import { decToNumber } from "./format";

export interface TicketCost {
  costUsd: number;
  calls: number;
  tools: number;
}

/** Per-ticket cost readout: total spend, model-call count, and tool-call count. */
export async function ticketCostSummary(ticketId: string): Promise<TicketCost> {
  const [agg, rows] = await Promise.all([
    prisma.llmCall.aggregate({
      where: { ticketId },
      _sum: { costUsd: true },
      _count: { _all: true },
    }),
    prisma.llmCall.findMany({ where: { ticketId }, select: { toolCalls: true } }),
  ]);
  // toolCalls is Json? — each row is an array of tool_use blocks (or null).
  const tools = rows.reduce(
    (n, r) => n + (Array.isArray(r.toolCalls) ? r.toolCalls.length : 0),
    0,
  );
  return { costUsd: decToNumber(agg._sum.costUsd), calls: agg._count._all, tools };
}

export interface InboxRow {
  id: string;
  subject: string;
  status: string;
  priority: string;
  channel: string;
  updatedAt: Date;
  customerName: string;
  customerPlan: string;
  /** What the agent's last run produced for this ticket. */
  outcome: "draft" | "sent" | "escalated" | "none";
  toolCount: number;
  costUsd: number;
  lastRunAt: Date | null;
  hasDraft: boolean;
}

/**
 * Inbox rows with the "agent footprint" (cost, tool count, last-run, outcome) derived
 * per ticket. One findMany + one grouped raw aggregate over LlmCall, joined in JS.
 */
export async function inboxRows(): Promise<InboxRow[]> {
  const [tickets, stats] = await Promise.all([
    prisma.ticket.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        customer: { select: { name: true, plan: true } },
        messages: { select: { role: true, status: true } },
      },
    }),
    prisma.$queryRaw<{ ticketId: string; cost: string; tools: number; lastrun: Date }[]>`
      SELECT "ticketId",
             SUM("costUsd") AS cost,
             COALESCE(SUM(CASE WHEN jsonb_typeof("toolCalls") = 'array'
                               THEN jsonb_array_length("toolCalls") ELSE 0 END), 0)::int AS tools,
             MAX("createdAt") AS lastrun
      FROM "LlmCall" WHERE "ticketId" IS NOT NULL GROUP BY "ticketId"`,
  ]);

  const byId = new Map(stats.map((s) => [s.ticketId, s]));
  return tickets.map((t) => {
    const st = byId.get(t.id);
    const hasDraft = t.messages.some((m) => m.role === "AI" && m.status === "DRAFT");
    const hasSent = t.messages.some((m) => m.role === "AI" && m.status === "SENT");
    const outcome: InboxRow["outcome"] =
      t.status === "ESCALATED" ? "escalated" : hasDraft ? "draft" : hasSent ? "sent" : "none";
    return {
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      channel: t.channel,
      updatedAt: t.updatedAt,
      customerName: t.customer.name,
      customerPlan: t.customer.plan,
      outcome,
      toolCount: st?.tools ?? 0,
      costUsd: decToNumber(st?.cost ?? 0),
      lastRunAt: st?.lastrun ?? null,
      hasDraft,
    };
  });
}

export interface SidebarStats {
  openCount: number;
  kbCount: number;
  todaySpend: number;
  todayCalls: number;
}

/** Ambient sidebar figures: open-ticket count, KB article count, today's spend. */
export async function sidebarStats(): Promise<SidebarStats> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [openCount, kbCount, today] = await Promise.all([
    prisma.ticket.count({ where: { status: "OPEN" } }),
    prisma.kbArticle.count(),
    prisma.llmCall.aggregate({
      where: { createdAt: { gte: startOfDay } },
      _sum: { costUsd: true },
      _count: { _all: true },
    }),
  ]);
  return {
    openCount,
    kbCount,
    todaySpend: decToNumber(today._sum.costUsd),
    todayCalls: today._count._all,
  };
}

export interface DashboardStats {
  totalSpend: number;
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalTickets: number;
  resolvedCount: number;
  avgCostPerResolved: number;
  spendByDay: { day: string; spend: number }[];
}

/**
 * Whole-workspace cost stats for the dashboard. "Resolved" = a ticket that has an
 * approved (SENT) AI message — i.e. a human accepted the agent's draft. Avg cost per
 * resolved aggregates spend over the SET of resolved ticket ids (never total/count,
 * which would fold in unresolved tickets and ticketId-null calls).
 */
export async function dashboardStats(): Promise<DashboardStats> {
  const [totals, tokens, resolvedRows, totalTickets, spendRows] = await Promise.all([
    prisma.llmCall.aggregate({ _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.llmCall.aggregate({
      _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true },
    }),
    prisma.message.findMany({
      where: { role: "AI", status: "SENT" },
      select: { ticketId: true },
      distinct: ["ticketId"],
    }),
    prisma.ticket.count(),
    // Bucket + format the day in SQL (to_char) so the label is UTC-deterministic and
    // doesn't depend on the Node server's TZ when a timestamp round-trips through Date.
    // SUM(numeric) comes back as a string from the pg driver — decToNumber handles it.
    prisma.$queryRaw<{ day: string; spend: string }[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             SUM("costUsd") AS spend
      FROM "LlmCall" GROUP BY day ORDER BY day`,
  ]);

  const resolvedIds = resolvedRows.map((r) => r.ticketId);
  const resolvedCost = resolvedIds.length
    ? decToNumber(
        (
          await prisma.llmCall.aggregate({
            where: { ticketId: { in: resolvedIds } },
            _sum: { costUsd: true },
          })
        )._sum.costUsd,
      )
    : 0;

  return {
    totalSpend: decToNumber(totals._sum.costUsd),
    totalCalls: totals._count._all,
    inputTokens: tokens._sum.inputTokens ?? 0,
    outputTokens: tokens._sum.outputTokens ?? 0,
    cacheReadTokens: tokens._sum.cacheReadTokens ?? 0,
    totalTickets,
    resolvedCount: resolvedIds.length,
    avgCostPerResolved: resolvedIds.length ? resolvedCost / resolvedIds.length : 0,
    spendByDay: spendRows.map((r) => ({ day: r.day, spend: decToNumber(r.spend) })),
  };
}
