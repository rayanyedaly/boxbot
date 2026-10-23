// lib/demo/tickets.ts
//
// Ticket operations for the public demo: who can see a ticket, resetting one to how it
// was seeded or submitted, and tickets visitors write themselves.

import { randomBytes } from "node:crypto";
import { Prisma, type Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { demoEnabled, demoLimits, GUEST_DOMAIN, TICKET_LIMITS } from "./config";
import { lockDemo } from "./runs";

/**
 * Seeded tickets are shared; a visitor's own tickets are visible only to them, so one
 * visitor's text never shows up in another's inbox. Outside demo mode, everything is.
 */
export function visibleTickets(visitorId: string | null): Prisma.TicketWhereInput {
  if (!demoEnabled()) return {};
  return visitorId ? { OR: [{ visitorId: null }, { visitorId }] } : { visitorId: null };
}

export function canSeeTicket(ticket: { visitorId: string | null }, visitorId: string | null): boolean {
  return !demoEnabled() || ticket.visitorId === null || ticket.visitorId === visitorId;
}

type SeedState = { status: string; priority: string; tags: string[] };

export function seedStateOf(t: SeedState): Prisma.InputJsonObject {
  return { status: t.status, priority: t.priority, tags: t.tags };
}

export type ResetResult = { ok: true } | { ok: false; message: string };

/**
 * Put a ticket back as it was seeded/submitted: drop the agent's drafts and replies,
 * restore status/priority/tags. Its model calls are detached, not deleted, so the cost
 * dashboard keeps the spend.
 */
export async function resetTicket(ticketId: string, visitorId: string | null): Promise<ResetResult> {
  return prisma.$transaction(async (tx) => {
    await lockDemo(tx);
    const t = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!t || !canSeeTicket(t, visitorId)) return { ok: false, message: "Ticket not found." };
    const seed = t.seedState as SeedState | null;
    if (!seed) return { ok: false, message: "This ticket has no saved starting state." };
    const live = new Date(Date.now() - demoLimits().staleRunMs);
    const busy = await tx.demoRun.count({ where: { ticketId, status: "RUNNING", startedAt: { gt: live } } });
    if (busy) return { ok: false, message: "The agent is running on this ticket. Reset it once the run finishes." };

    await tx.llmCall.updateMany({ where: { ticketId }, data: { ticketId: null } });
    await tx.compaction.updateMany({ where: { ticketId }, data: { ticketId: null } });
    await tx.message.deleteMany({ where: { ticketId, role: "AI" } });
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status: seed.status as Prisma.TicketUpdateInput["status"],
        priority: seed.priority as Prisma.TicketUpdateInput["priority"],
        tags: seed.tags,
      },
    });
    return { ok: true };
  });
}

export type Persona = { id: string; name: string; plan: Plan; orders: number; tickets: number };

/** Seeded customers a visitor can write as — each brings real orders and history. */
export async function personas(): Promise<Persona[]> {
  const rows = await prisma.customer.findMany({
    where: { NOT: { email: { endsWith: `@${GUEST_DOMAIN}` } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, plan: true, _count: { select: { orders: true, tickets: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, plan: r.plan, orders: r._count.orders, tickets: r._count.tickets }));
}

export type NewTicketInput = { customerId: string; guestName?: string; subject: string; body: string };
export type CreateResult = { ok: true; ticketId: string } | { ok: false; message: string };

export function validateTicket(input: NewTicketInput): string | null {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) return "Add a subject.";
  if (subject.length > TICKET_LIMITS.subjectMax) return `Keep the subject under ${TICKET_LIMITS.subjectMax} characters.`;
  if (body.length < TICKET_LIMITS.bodyMin) return "Write a little more in the message.";
  if (body.length > TICKET_LIMITS.bodyMax) return `Keep the message under ${TICKET_LIMITS.bodyMax} characters.`;
  if (!input.customerId) return "Pick who the ticket is from.";
  return null;
}

/**
 * Create a ticket from the "write your own" form. In the demo it belongs to the visitor
 * (private to them, capped per cookie, per IP hash and per day); outside the demo
 * (visitor null) it's an ordinary ticket.
 */
export async function createVisitorTicket(
  input: NewTicketInput,
  visitor: { id: string; ipHash: string } | null,
): Promise<CreateResult> {
  const invalid = validateTicket(input);
  if (invalid) return { ok: false, message: invalid };
  const l = demoLimits();
  const visitorId = visitor?.id ?? null;

  return prisma.$transaction(async (tx) => {
    await lockDemo(tx);
    if (visitor) {
      const now = Date.now();
      const dayAgo = new Date(now - 86_400_000);
      const dayStart = new Date(new Date(now).setUTCHours(0, 0, 0, 0));
      const [mine, network, today] = await Promise.all([
        tx.ticket.count({ where: { visitorId: visitor.id, createdAt: { gt: dayAgo } } }),
        // Clearing cookies mints a new visitor; the IP hash is what bounds a script.
        tx.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM "Ticket" t JOIN "DemoVisitor" v ON v."id" = t."visitorId"
          WHERE v."ipHash" = ${visitor.ipHash} AND t."createdAt" > ${dayAgo}`,
        tx.ticket.count({ where: { visitorId: { not: null }, createdAt: { gte: dayStart } } }),
      ]);
      if (mine >= l.ticketsPerVisitor || network[0].n >= l.ticketsPerIp)
        return { ok: false as const, message: `You can write ${l.ticketsPerVisitor} tickets per 24 hours.` };
      if (today >= l.ticketsPerDay) return { ok: false as const, message: "The demo has taken all the new tickets it can for today." };
    }

    let customerId = input.customerId;
    if (customerId === "new") {
      const name = input.guestName?.replace(/\s+/g, " ").trim().slice(0, TICKET_LIMITS.nameMax) || "Guest";
      const guest = await tx.customer.create({
        data: { name, email: `guest-${randomBytes(4).toString("hex")}@${GUEST_DOMAIN}`, plan: "FREE" },
      });
      customerId = guest.id;
    } else {
      const c = await tx.customer.findUnique({ where: { id: customerId } });
      if (!c || c.email.endsWith(`@${GUEST_DOMAIN}`)) return { ok: false as const, message: "Pick who the ticket is from." };
    }

    const initial = { status: "OPEN", priority: "MEDIUM", tags: visitor ? ["visitor"] : [] };
    const ticket = await tx.ticket.create({
      data: {
        customerId,
        subject: input.subject.trim(),
        status: "OPEN",
        priority: "MEDIUM",
        channel: "WEB",
        tags: initial.tags,
        visitorId,
        seedState: seedStateOf(initial),
        messages: { create: [{ role: "CUSTOMER", status: "SENT", body: input.body.trim() }] },
      },
    });
    return { ok: true as const, ticketId: ticket.id };
  });
}
