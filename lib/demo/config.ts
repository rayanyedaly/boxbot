// lib/demo/config.ts
//
// Public-demo guardrails are off unless DEMO_MODE=true, so local dev, tests and evals
// behave exactly as before. Limits are env-tunable; the defaults are sized for a
// recruiter-facing demo at ~$0.02 per agent run.

// 0 is allowed: DEMO_DAILY_USD=0 or DEMO_MAX_CONCURRENT=0 is the kill switch for runs.
const num = (name: string, fallback: number) => {
  const raw = process.env[name];
  const v = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(v) && v >= 0 ? v : fallback;
};

export const demoEnabled = () => process.env.DEMO_MODE === "true";

export type DemoLimits = {
  /** Agent runs per browser (cookie) in a rolling 24h. */
  runsPerVisitor: number;
  /** Agent runs per IP in a rolling 24h — looser, since offices share an IP. */
  runsPerIp: number;
  /** Spend caps, read from the real per-run cost (UTC day / UTC calendar month). */
  dailyUsd: number;
  monthlyUsd: number;
  /** Agent runs in flight at once, across all visitors. */
  maxConcurrent: number;
  /** Cost reserved for a run still in flight (or one that never reported back). */
  runReserveUsd: number;
  /** A RUNNING row older than this is treated as dead: it no longer holds a slot. */
  staleRunMs: number;
  /** Tickets a visitor (cookie / IP hash) may write per rolling 24h, and across all visitors per UTC day. */
  ticketsPerVisitor: number;
  ticketsPerIp: number;
  ticketsPerDay: number;
};

export function demoLimits(): DemoLimits {
  return {
    runsPerVisitor: num("DEMO_RUNS_PER_VISITOR", 10),
    runsPerIp: num("DEMO_RUNS_PER_IP", 30),
    dailyUsd: num("DEMO_DAILY_USD", 3),
    monthlyUsd: num("DEMO_MONTHLY_USD", 25),
    maxConcurrent: num("DEMO_MAX_CONCURRENT", 3),
    runReserveUsd: 0.05,
    staleRunMs: 10 * 60_000,
    ticketsPerVisitor: num("DEMO_TICKETS_PER_VISITOR", 5),
    ticketsPerIp: num("DEMO_TICKETS_PER_IP", 15),
    ticketsPerDay: num("DEMO_TICKETS_PER_DAY", 200),
  };
}

// Customers created for "new customer" visitor tickets. Agent tools and the persona
// picker hide them from everyone but the ticket they were created for.
export const GUEST_DOMAIN = "guest.boxbot.dev";

// Visitor-written tickets: bounded so one ticket can't run up a large prompt.
export const TICKET_LIMITS = { subjectMax: 120, bodyMin: 10, bodyMax: 2000, nameMax: 80 } as const;
