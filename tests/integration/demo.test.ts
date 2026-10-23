import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "../../lib/prisma";
import { admitRun, finishRun, lockDemo, usageSnapshot, visitorQuota } from "../../lib/demo/runs";
import { demoLimits } from "../../lib/demo/config";
import { createVisitorTicket, resetTicket, canSeeTicket, visibleTickets } from "../../lib/demo/tickets";
import { inboxRows, sidebarStats, dashboardStats } from "../../lib/queries";
import { runTool } from "../../lib/agent/tools";

// Public-demo guardrails against the seeded test DB. DemoRun ticket ids are plain
// strings (no FK), so most admission tests use made-up ids.

const A = { id: "00000000-0000-4000-8000-00000000000a", ipHash: "ip-a" };
const B = { id: "00000000-0000-4000-8000-00000000000b", ipHash: "ip-b" };
const C = { id: "00000000-0000-4000-8000-00000000000c", ipHash: "ip-c" }; // reset tests: own ticket allowance
const createdTickets: string[] = [];
const extraVisitors: string[] = [];

// Pin the limits, so a DEMO_* value in the environment can't skew these tests.
const LIMIT_ENV = {
  DEMO_MODE: "true",
  DEMO_RUNS_PER_VISITOR: "10",
  DEMO_RUNS_PER_IP: "30",
  DEMO_DAILY_USD: "3",
  DEMO_MONTHLY_USD: "25",
  DEMO_MAX_CONCURRENT: "3",
  DEMO_TICKETS_PER_VISITOR: "5",
  DEMO_TICKETS_PER_IP: "15",
  DEMO_TICKETS_PER_DAY: "200",
};

const run = (who: { id: string; ipHash: string }, ticketId: string, extra: Record<string, unknown> = {}) => ({
  visitorId: who.id,
  ipHash: who.ipHash,
  ticketId,
  ...extra,
});

async function visitorTicket(who: { id: string; ipHash: string }, subject: string, customerId = "new") {
  const t = await createVisitorTicket(
    { customerId, guestName: `Guest ${subject}`, subject, body: `Body for ${subject}, long enough.` },
    who,
  );
  if (!t.ok) throw new Error(t.message);
  createdTickets.push(t.ticketId);
  return t.ticketId;
}

beforeAll(async () => {
  Object.assign(process.env, LIMIT_ENV);
  for (const v of [A, B, C]) await prisma.demoVisitor.upsert({ where: { id: v.id }, create: v, update: {} });
});

beforeEach(async () => {
  await prisma.demoRun.deleteMany();
});

afterAll(async () => {
  await prisma.demoRun.deleteMany();
  await prisma.llmCall.deleteMany({ where: { ticketId: { in: createdTickets } } });
  await prisma.message.deleteMany({ where: { ticketId: { in: createdTickets } } });
  const guests = await prisma.ticket.findMany({ where: { id: { in: createdTickets } }, select: { customerId: true } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTickets } } });
  await prisma.customer.deleteMany({
    where: { id: { in: guests.map((g) => g.customerId) }, email: { endsWith: "@guest.boxbot.dev" } },
  });
  await prisma.demoVisitor.deleteMany({ where: { id: { in: [A.id, B.id, C.id, ...extraVisitors] } } });
  for (const k of Object.keys(LIMIT_ENV)) delete process.env[k];
});

describe("admitRun", () => {
  it("serializes admission on the advisory lock", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const holder = prisma.$transaction(
      async (tx) => {
        await lockDemo(tx);
        await held;
      },
      { timeout: 10_000 },
    );
    await new Promise((r) => setTimeout(r, 150)); // let the holder take the lock
    let settled = false;
    const pending = admitRun(A, "locked").then((r) => ((settled = true), r));
    await new Promise((r) => setTimeout(r, 300));
    expect(settled).toBe(false); // waiting on the lock
    release();
    await holder;
    expect((await pending).ok).toBe(true);
  });

  it("admits exactly maxConcurrent runs when many requests race", async () => {
    const ids = Array.from({ length: 8 }, (_, i) => `race-${i}`);
    const results = await Promise.all(ids.map((t) => admitRun(A, t)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(new Set(results.filter((r) => !r.ok).map((r) => !r.ok && r.code))).toEqual(new Set(["busy"]));
    expect(await prisma.demoRun.count({ where: { status: "RUNNING" } })).toBe(3);
  });

  it("allows one live run per ticket across visitors", async () => {
    expect((await admitRun(A, "same")).ok).toBe(true);
    const second = await admitRun(B, "same");
    expect(second.ok ? null : second.code).toBe("ticket_busy");
  });

  it("enforces the per-visitor limit over a rolling 24h, ignoring older runs", async () => {
    const old = new Date(Date.now() - 25 * 3_600_000);
    await prisma.demoRun.createMany({
      data: [
        ...Array.from({ length: 9 }, (_, i) => run(A, `done-${i}`, { status: "DONE" })),
        run(A, "old", { status: "DONE", startedAt: old }),
      ],
    });
    expect((await admitRun(A, "tenth")).ok).toBe(true);
    const eleventh = await admitRun(A, "eleventh");
    expect(eleventh.ok ? null : eleventh.code).toBe("visitor_limit");
    expect((await admitRun(B, "other-visitor")).ok).toBe(true);
    expect((await visitorQuota({ visitorId: A.id, ipHash: A.ipHash })).runsLeft).toBe(0);
  });

  it("caps an IP across fresh cookies (the limit a script can't reset)", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `00000000-0000-4000-8000-1000000000${String(i).padStart(2, "0")}`);
    extraVisitors.push(...ids);
    await prisma.demoVisitor.createMany({ data: ids.map((id) => ({ id, ipHash: "ip-shared" })) });
    await prisma.demoRun.createMany({ data: ids.map((id, i) => run({ id, ipHash: "ip-shared" }, `ip-${i}`, { status: "DONE" })) });
    const fresh = { id: ids[0], ipHash: "ip-shared" };
    const r = await admitRun(fresh, "one-more");
    expect(r.ok ? null : r.code).toBe("ip_limit");
    expect((await admitRun({ id: ids[1], ipHash: "ip-other" }, "other-network")).ok).toBe(true);
  });

  it("stops everyone once settled spend plus the in-flight reserve reaches the daily cap", async () => {
    await prisma.demoRun.create({ data: run(B, "spent", { status: "DONE", costUsd: "2.92" }) });
    expect((await admitRun(A, "fits")).ok).toBe(true); // 2.92 + 0.05 reserve for itself
    // Now one RUNNING row (that admission) holds 0.05: 2.92 + 0.05 + 0.05 > 3.
    const r = await admitRun(B, "over");
    expect(r.ok ? null : r.code).toBe("budget_day");
    expect((await visitorQuota({ visitorId: A.id, ipHash: A.ipHash })).resting).toBe("day");
  });

  it("frees a dead run's slot after the stale window, but keeps counting its reserve", async () => {
    const stale = new Date(Date.now() - demoLimits().staleRunMs - 60_000);
    await prisma.demoRun.createMany({ data: ["s1", "s2", "s3"].map((t) => run(B, t, { startedAt: stale })) });
    expect((await admitRun(A, "fresh")).ok).toBe(true);
    const snap = await usageSnapshot(prisma, { visitorId: A.id, ipHash: A.ipHash }, null);
    expect(snap.inFlight).toBe(1);
    expect(snap.spentTodayUsd).toBeCloseTo(4 * 0.05, 6);
  });
});

describe("usageSnapshot spend windows (UTC day, UTC month)", () => {
  it("counts this month and today only, with RUNNING rows at the reserve", async () => {
    const now = new Date(Date.UTC(2026, 9, 15, 12, 0));
    const at = (d: number, h: number, m = 0) => new Date(Date.UTC(2026, 9, d, h, m));
    await prisma.demoRun.createMany({
      data: [
        run(B, "last-month", { status: "DONE", costUsd: "7", startedAt: new Date(Date.UTC(2026, 8, 30, 12)) }),
        run(B, "early-month", { status: "DONE", costUsd: "20", startedAt: at(2, 9) }),
        run(B, "yesterday", { status: "DONE", costUsd: "2", startedAt: at(14, 23) }),
        run(B, "today", { status: "DONE", costUsd: "0.5", startedAt: at(15, 1) }),
        run(B, "live", { startedAt: at(15, 11, 55) }),
        run(B, "dead", { startedAt: at(15, 9) }),
      ],
    });
    const s = await usageSnapshot(prisma, { visitorId: B.id, ipHash: B.ipHash }, null, demoLimits(), now);
    expect(s.spentMonthUsd).toBeCloseTo(20 + 2 + 0.5 + 0.05 + 0.05, 6);
    expect(s.spentTodayUsd).toBeCloseTo(0.5 + 0.05 + 0.05, 6);
    expect(s.inFlight).toBe(1);
    expect(s.visitorRuns24h).toBe(4); // yesterday 23:00 is inside the rolling 24h
  });

  it("starts a new month clean on the 1st", async () => {
    const now = new Date(Date.UTC(2026, 10, 1, 6));
    await prisma.demoRun.createMany({
      data: [
        run(B, "oct", { status: "DONE", costUsd: "24", startedAt: new Date(Date.UTC(2026, 9, 31, 22)) }),
        run(B, "nov", { status: "DONE", costUsd: "1", startedAt: new Date(Date.UTC(2026, 10, 1, 1)) }),
      ],
    });
    const s = await usageSnapshot(prisma, { visitorId: B.id, ipHash: B.ipHash }, null, demoLimits(), now);
    expect(s.spentMonthUsd).toBeCloseTo(1, 6);
    expect(s.spentTodayUsd).toBeCloseTo(1, 6);
  });
});

describe("finishRun", () => {
  it("settles a completed run at the cost it reports", async () => {
    const admitted = await admitRun(A, "settle-me");
    if (!admitted.ok) throw new Error("not admitted");
    await finishRun(admitted.runId, true, 0.0213);
    const r = await prisma.demoRun.findUniqueOrThrow({ where: { id: admitted.runId } });
    expect(r.status).toBe("DONE");
    expect(Number(r.costUsd)).toBeCloseTo(0.0213, 6);
    expect(r.finishedAt).not.toBeNull();
  });

  it("charges a failed run at least the reserve (spend can go unreported), more if reported", async () => {
    const a = await admitRun(A, "fail-cheap");
    const b = await admitRun(A, "fail-dear");
    if (!a.ok || !b.ok) throw new Error("not admitted");
    await finishRun(a.runId, false, 0);
    await finishRun(b.runId, false, 0.08);
    const [ra, rb] = await Promise.all([a.runId, b.runId].map((id) => prisma.demoRun.findUniqueOrThrow({ where: { id } })));
    expect(ra.status).toBe("ERROR");
    expect(Number(ra.costUsd)).toBeCloseTo(0.05, 6);
    expect(Number(rb.costUsd)).toBeCloseTo(0.08, 6);
  });

  it("never overwrites a run that was already closed", async () => {
    const closed = await prisma.demoRun.create({ data: run(A, "closed", { status: "ERROR", costUsd: "0.05" }) });
    await finishRun(closed.id, true, 0);
    const r = await prisma.demoRun.findUniqueOrThrow({ where: { id: closed.id } });
    expect(r.status).toBe("ERROR");
    expect(Number(r.costUsd)).toBeCloseTo(0.05, 6);
  });
});

describe("visitor tickets: privacy", () => {
  it("keeps a visitor's ticket out of other visitors' inbox, sidebar and dashboard", async () => {
    const id = await visitorTicket(A, "Private to A");
    await prisma.llmCall.create({
      data: { ticketId: id, model: "claude-sonnet-5-5", inputTokens: 1, outputTokens: 1, costUsd: 0.01, latencyMs: 3 },
    });
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(canSeeTicket(ticket, A.id)).toBe(true);
    expect(canSeeTicket(ticket, B.id)).toBe(false);
    expect(canSeeTicket(ticket, null)).toBe(false);

    expect((await inboxRows(visibleTickets(B.id))).some((r) => r.id === id)).toBe(false);
    expect((await inboxRows(visibleTickets(A.id))).some((r) => r.id === id)).toBe(true);

    const openSeeded = await prisma.ticket.count({ where: { status: "OPEN", visitorId: null } });
    expect((await sidebarStats(visibleTickets(null))).openCount).toBe(openSeeded);

    const forB = await dashboardStats({ all: false, visitorId: B.id });
    expect(forB.recentRuns.some((r) => r.ticketId === id)).toBe(false);
    const forA = await dashboardStats({ all: false, visitorId: A.id });
    expect(forA.recentRuns.some((r) => r.ticketId === id)).toBe(true);
    expect(forA.totalTickets).toBe(forB.totalTickets + 1);

    expect((await resetTicket(id, B.id)).ok).toBe(false);
  });

  it("keeps the agent's tools from surfacing another visitor's ticket or guest", async () => {
    const maya = await prisma.customer.findUniqueOrThrow({ where: { email: "maya.chen@example.com" } });
    const mine = await visitorTicket(A, "Written as Maya", maya.id);
    const guestTicket = await visitorTicket(A, "Guest Zelda");
    const featured = await prisma.ticket.findFirstOrThrow({ where: { customerId: maya.id, visitorId: null } });
    const ctxB = { ticketId: featured.id, customerId: maya.id };

    const history = (await runTool("get_ticket_history", { customerId: maya.id, limit: 20 }, ctxB)) as {
      tickets: { id: string }[];
    };
    expect(history.tickets.some((t) => t.id === mine)).toBe(false);
    // The author's own run still sees its ticket.
    const own = (await runTool("get_ticket_history", { customerId: maya.id, limit: 20 }, { ticketId: mine, customerId: maya.id })) as {
      tickets: { id: string }[];
    };
    expect(own.tickets.some((t) => t.id === mine)).toBe(true);

    const guest = await prisma.ticket.findUniqueOrThrow({ where: { id: guestTicket }, include: { customer: true } });
    const found = (await runTool("search_customer", { query: guest.customer.name }, ctxB)) as { matches: unknown[] };
    expect(found.matches).toEqual([]);
    const foundOwn = (await runTool("search_customer", { query: guest.customer.name }, {
      ticketId: guestTicket,
      customerId: guest.customerId,
    })) as { matches: { id: string }[] };
    expect(foundOwn.matches.map((m) => m.id)).toEqual([guest.customerId]);
  });

  it("refuses writes to any ticket but the one being resolved", async () => {
    const victim = await prisma.ticket.findFirstOrThrow({ where: { visitorId: null, status: "OPEN" } });
    const attacker = await visitorTicket(A, "Injection");
    const ctx = { ticketId: attacker, customerId: (await prisma.ticket.findUniqueOrThrow({ where: { id: attacker } })).customerId };
    for (const [name, input] of [
      ["draft_reply", { ticketId: victim.id, body: "pwned" }],
      ["update_ticket", { ticketId: victim.id, status: "RESOLVED" }],
      ["escalate_ticket", { ticketId: victim.id, team: "billing", reason: "x" }],
    ] as const) {
      expect(await runTool(name, input, ctx)).toMatchObject({ error: "wrong_ticket" });
    }
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: victim.id }, include: { messages: true } });
    expect(after.status).toBe(victim.status);
    expect(after.messages.some((m) => m.body === "pwned")).toBe(false);
    expect(await runTool("draft_reply", { ticketId: attacker, body: "ok" }, ctx)).toMatchObject({ staged: true });
  });

  it("won't let a visitor write as another visitor's guest customer, or a made-up one", async () => {
    const t = await visitorTicket(A, "Guest owner");
    const { customerId } = await prisma.ticket.findUniqueOrThrow({ where: { id: t } });
    expect((await createVisitorTicket({ customerId, subject: "x", body: "long enough body" }, B)).ok).toBe(false);
    expect((await createVisitorTicket({ customerId: "nope", subject: "x", body: "long enough body" }, B)).ok).toBe(false);
  });
});

describe("resetTicket", () => {
  it("restores status/priority/tags, drops AI messages and detaches (not deletes) model calls", async () => {
    const id = await visitorTicket(C, "Reset me");
    await prisma.ticket.update({ where: { id }, data: { status: "ESCALATED", priority: "URGENT", tags: ["visitor", "escalated:billing"] } });
    await prisma.message.create({ data: { ticketId: id, role: "AI", status: "DRAFT", body: "draft" } });
    const call = await prisma.llmCall.create({
      data: { ticketId: id, model: "claude-sonnet-5-5", inputTokens: 1, outputTokens: 1, costUsd: 0.01, latencyMs: 2 },
    });

    expect(await resetTicket(id, C.id)).toEqual({ ok: true });

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id }, include: { messages: true } });
    expect(after.status).toBe("OPEN");
    expect(after.priority).toBe("MEDIUM");
    expect(after.tags).toEqual(["visitor"]);
    expect(after.messages.map((m) => m.role)).toEqual(["CUSTOMER"]);
    expect((await prisma.llmCall.findUniqueOrThrow({ where: { id: call.id } })).ticketId).toBeNull();
    await prisma.llmCall.delete({ where: { id: call.id } });
  });

  it("waits for a live run, but not for a dead one", async () => {
    const id = await visitorTicket(C, "Busy");
    const live = await admitRun(C, id);
    expect(live.ok).toBe(true);
    const blocked = await resetTicket(id, C.id);
    expect(blocked.ok ? null : blocked.message).toMatch(/running/);

    await prisma.demoRun.updateMany({
      where: { ticketId: id },
      data: { startedAt: new Date(Date.now() - demoLimits().staleRunMs - 60_000) },
    });
    expect((await resetTicket(id, C.id)).ok).toBe(true);
  });
});

describe("visitor ticket caps", () => {
  it("caps tickets per visitor per 24h", async () => {
    const mine = await prisma.ticket.count({ where: { visitorId: B.id } });
    for (let i = mine; i < 5; i++) await visitorTicket(B, `Cap ${i}`);
    const sixth = await createVisitorTicket(
      { customerId: "new", guestName: "Cap", subject: "Cap 6", body: "Counting toward the cap." },
      B,
    );
    expect(sixth.ok).toBe(false);
    expect(await prisma.ticket.count({ where: { visitorId: B.id } })).toBe(5);
  });

  it("caps tickets per IP across fresh cookies", async () => {
    const ids = Array.from({ length: 16 }, (_, i) => `00000000-0000-4000-8000-2000000000${String(i).padStart(2, "0")}`);
    extraVisitors.push(...ids);
    await prisma.demoVisitor.createMany({ data: ids.map((id) => ({ id, ipHash: "ip-tickets" })) });
    const results: boolean[] = [];
    for (const id of ids) {
      const r = await createVisitorTicket(
        { customerId: "new", guestName: "Net", subject: "Net", body: "One per fresh cookie." },
        { id, ipHash: "ip-tickets" },
      );
      if (r.ok) createdTickets.push(r.ticketId);
      results.push(r.ok);
    }
    expect(results.filter(Boolean)).toHaveLength(15);
    expect(results.at(-1)).toBe(false);
  });
});
