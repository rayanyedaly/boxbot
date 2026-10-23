import { describe, it, expect } from "vitest";
import { decideAdmission, runsLeft, type UsageSnapshot } from "../../lib/demo/admission";
import type { DemoLimits } from "../../lib/demo/config";
import { validateTicket, visibleTickets, canSeeTicket } from "../../lib/demo/tickets";
import { demoLimits } from "../../lib/demo/config";
import { adminTokenOk } from "../../lib/demo/admin";
import { modelLabel } from "../../lib/format";

const L: DemoLimits = {
  runsPerVisitor: 10,
  runsPerIp: 30,
  dailyUsd: 3,
  monthlyUsd: 25,
  maxConcurrent: 3,
  runReserveUsd: 0.05,
  staleRunMs: 300_000,
  ticketsPerVisitor: 5,
  ticketsPerIp: 15,
  ticketsPerDay: 200,
};
const idle: UsageSnapshot = { visitorRuns24h: 0, ipRuns24h: 0, spentTodayUsd: 0, spentMonthUsd: 0, inFlight: 0, ticketBusy: false };
const code = (s: Partial<UsageSnapshot>) => {
  const d = decideAdmission({ ...idle, ...s }, L);
  return d.ok ? "ok" : d.code;
};

describe("decideAdmission", () => {
  it("admits an idle visitor", () => expect(code({})).toBe("ok"));

  it("stops at exactly the per-visitor and per-IP limits", () => {
    expect(code({ visitorRuns24h: 9 })).toBe("ok");
    expect(code({ visitorRuns24h: 10 })).toBe("visitor_limit");
    expect(code({ ipRuns24h: 29 })).toBe("ok");
    expect(code({ ipRuns24h: 30 })).toBe("ip_limit");
  });

  it("keeps a run's reserve inside the spend caps", () => {
    expect(code({ spentTodayUsd: 2.9 })).toBe("ok");
    expect(code({ spentTodayUsd: 2.97 })).toBe("budget_day");
    expect(code({ spentMonthUsd: 24.9 })).toBe("ok");
    expect(code({ spentMonthUsd: 24.97 })).toBe("budget_month");
  });

  it("reports the budget before the visitor's own limit (the demo is resting, not them)", () => {
    expect(code({ spentTodayUsd: 3, visitorRuns24h: 10 })).toBe("budget_day");
    expect(code({ spentMonthUsd: 25, spentTodayUsd: 3 })).toBe("budget_month");
  });

  it("refuses a second live run on the same ticket, and caps concurrency", () => {
    expect(code({ ticketBusy: true })).toBe("ticket_busy");
    expect(code({ inFlight: 2 })).toBe("ok");
    expect(code({ inFlight: 3 })).toBe("busy");
  });

  it("uses HTTP 503 for the budget and 429/409 for the rest", () => {
    const status = (s: Partial<UsageSnapshot>) => {
      const d = decideAdmission({ ...idle, ...s }, L);
      return d.ok ? 200 : d.status;
    };
    expect(status({ spentTodayUsd: 3 })).toBe(503);
    expect(status({ visitorRuns24h: 10 })).toBe(429);
    expect(status({ ticketBusy: true })).toBe(409);
  });
});

describe("runsLeft", () => {
  it("is the tighter of the visitor and IP allowances, never negative", () => {
    expect(runsLeft({ visitorRuns24h: 3, ipRuns24h: 0 }, L)).toBe(7);
    expect(runsLeft({ visitorRuns24h: 0, ipRuns24h: 28 }, L)).toBe(2);
    expect(runsLeft({ visitorRuns24h: 12, ipRuns24h: 0 }, L)).toBe(0);
  });
});

describe("validateTicket", () => {
  const ok = { customerId: "c1", subject: "Refund", body: "Where is my refund please?" };
  it("accepts a normal ticket", () => expect(validateTicket(ok)).toBeNull());
  it("rejects empty, short and oversized fields", () => {
    expect(validateTicket({ ...ok, subject: "   " })).toMatch(/subject/i);
    expect(validateTicket({ ...ok, subject: "x".repeat(121) })).toMatch(/120/);
    expect(validateTicket({ ...ok, body: "hi" })).toMatch(/more/);
    expect(validateTicket({ ...ok, body: "x".repeat(2001) })).toMatch(/2000/);
    expect(validateTicket({ ...ok, customerId: "" })).toMatch(/who/);
  });
});

describe("modelLabel", () => {
  it("formats model ids for copy", () => {
    expect(modelLabel("claude-sonnet-5-5")).toBe("Claude Sonnet 5.5");
    expect(modelLabel("claude-haiku-4-5-20251001")).toBe("Claude Haiku 4.5");
    expect(modelLabel("claude-opus-5")).toBe("Claude Opus 5");
  });
});

describe("with DEMO_MODE off (local dev, tests, evals)", () => {
  it("shows every ticket", () => {
    delete process.env.DEMO_MODE;
    expect(visibleTickets(null)).toEqual({});
    expect(canSeeTicket({ visitorId: "someone" }, null)).toBe(true);
  });
  it("is off unless DEMO_MODE is exactly 'true'", () => {
    process.env.DEMO_MODE = "TRUE";
    expect(visibleTickets(null)).toEqual({});
    process.env.DEMO_MODE = "true";
    expect(visibleTickets(null)).toEqual({ visitorId: null });
    delete process.env.DEMO_MODE;
  });
});

describe("demoLimits env parsing", () => {
  it("accepts 0 as a kill switch and ignores junk", () => {
    process.env.DEMO_DAILY_USD = "0";
    process.env.DEMO_MAX_CONCURRENT = "abc";
    process.env.DEMO_RUNS_PER_VISITOR = "";
    const l = demoLimits();
    expect(l.dailyUsd).toBe(0);
    expect(l.maxConcurrent).toBe(3);
    expect(l.runsPerVisitor).toBe(10);
    delete process.env.DEMO_DAILY_USD;
    delete process.env.DEMO_MAX_CONCURRENT;
    delete process.env.DEMO_RUNS_PER_VISITOR;
  });
});

describe("adminTokenOk", () => {
  it("is closed when unset and only opens on an exact match", () => {
    expect(adminTokenOk("anything", undefined)).toBe(false);
    expect(adminTokenOk("", "")).toBe(false);
    expect(adminTokenOk(undefined, "secret-token")).toBe(false);
    expect(adminTokenOk("secret-tokeX", "secret-token")).toBe(false);
    expect(adminTokenOk("secret", "secret-token")).toBe(false);
    expect(adminTokenOk("secret-token", "secret-token")).toBe(true);
  });
});
