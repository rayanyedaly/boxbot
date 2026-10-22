// evals/fixtures/load.ts
//
// Resets the eval database to the fixture world plus ONE open ticket (the case under
// test). Every case runs against a fresh world, so a case can never see another case's
// drafts, status changes, or escalations. The world is small, so a full wipe + reload
// per case takes well under a second.

import type { Channel, PrismaClient, TicketPriority } from "@prisma/client";
import { KB_ARTICLES, daysAgo, type CustomerKey, type WorldCustomer } from "./world";
import type { HoldoutCustomerKey } from "./holdout-world";

/** Any fixture customer key — dev world or held-out additions. */
export type AnyCustomerKey = CustomerKey | HoldoutCustomerKey;

export interface OpenTicketSpec {
  customer: AnyCustomerKey;
  subject: string;
  body: string;
  channel: Channel;
  priority: TicketPriority;
  tags?: string[];
}

export interface LoadedWorld {
  ticketId: string;
  /** Fixture key -> real customer id, so graders can check which customer tools touched. */
  customerIds: Record<string, string>;
}

export const EVAL_DB_NAME = "inbox_eval";

/**
 * Refuse to touch anything that isn't the dedicated eval database. Checks the parsed
 * database name — not a substring — so a user, password, or query param that merely
 * contains "inbox_eval" can't pass.
 */
export function assertEvalDatabase(url: string | undefined): void {
  let dbName: string | null = null;
  try {
    dbName = url ? decodeURIComponent(new URL(url).pathname.replace(/^\//, "")) : null;
  } catch {
    /* unparseable → refuse below */
  }
  if (dbName !== EVAL_DB_NAME) {
    throw new Error(
      `Refusing to load the eval world into a non-eval database: ${url ?? "(DATABASE_URL unset)"}`,
    );
  }
}

/** EVAL_DATABASE_URL if set, else DATABASE_URL with the database renamed to inbox_eval. */
export function evalDatabaseUrl(env: Record<string, string | undefined>): string {
  if (env.EVAL_DATABASE_URL) return env.EVAL_DATABASE_URL;
  if (!env.DATABASE_URL) throw new Error("Set EVAL_DATABASE_URL or DATABASE_URL.");
  const url = new URL(env.DATABASE_URL);
  url.pathname = `/${EVAL_DB_NAME}`;
  return url.toString();
}

export async function loadWorld(
  prisma: PrismaClient,
  open: OpenTicketSpec,
  customers: Record<string, WorldCustomer>,
): Promise<LoadedWorld> {
  if (!customers[open.customer]) throw new Error(`Ticket customer "${open.customer}" isn't in this world`);
  assertEvalDatabase(process.env.DATABASE_URL);

  // FK-safe wipe: children before parents.
  await prisma.compaction.deleteMany();
  await prisma.llmCall.deleteMany();
  await prisma.message.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.kbArticle.deleteMany();

  await prisma.kbArticle.createMany({ data: KB_ARTICLES });

  const customerIds: Record<string, string> = {};
  for (const [key, c] of Object.entries(customers)) {
    const created = await prisma.customer.create({
      data: {
        name: c.name,
        email: c.email,
        plan: c.plan,
        createdAt: daysAgo(c.createdDaysAgo),
        orders: {
          create: (c.orders ?? []).map((o) => ({
            status: o.status,
            amountUsd: o.amountUsd,
            description: o.description,
            createdAt: daysAgo(o.daysAgo),
          })),
        },
        tickets: {
          create: (c.history ?? []).map((t) => ({
            subject: t.subject,
            status: t.status,
            priority: t.priority,
            channel: t.channel,
            tags: t.tags,
            createdAt: daysAgo(t.daysAgo),
            messages: {
              create: t.messages.map((m) => ({
                role: m.role,
                body: m.body,
                status: "SENT" as const,
                createdAt: daysAgo(t.daysAgo),
              })),
            },
          })),
        },
      },
      select: { id: true },
    });
    customerIds[key] = created.id;
  }

  const ticket = await prisma.ticket.create({
    data: {
      customerId: customerIds[open.customer],
      subject: open.subject,
      status: "OPEN",
      priority: open.priority,
      channel: open.channel,
      tags: open.tags ?? [],
      createdAt: daysAgo(0),
      messages: {
        create: [{ role: "CUSTOMER", status: "SENT", body: open.body, createdAt: daysAgo(0) }],
      },
    },
    select: { id: true },
  });

  return { ticketId: ticket.id, customerIds };
}
