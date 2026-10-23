// lib/demo/admission.ts
//
// The admission decision for one agent run, as a pure function over a usage snapshot
// so the policy is testable without a database. runs.ts gathers the snapshot under a
// lock and records the run when this says yes.

import type { DemoLimits } from "./config";

export type UsageSnapshot = {
  visitorRuns24h: number;
  ipRuns24h: number;
  /** Settled cost plus a reserve for in-flight / unreported runs. */
  spentTodayUsd: number;
  spentMonthUsd: number;
  /** Runs started within the stale window that haven't finished. */
  inFlight: number;
  /** Another live run is already working this ticket. */
  ticketBusy: boolean;
};

export type Admission =
  | { ok: true }
  | { ok: false; code: DenyCode; status: number; message: string };

export type DenyCode = "visitor_limit" | "ip_limit" | "budget_day" | "budget_month" | "busy" | "ticket_busy";

export function decideAdmission(s: UsageSnapshot, l: DemoLimits): Admission {
  // Budget first: when the demo is resting, say so rather than blaming the visitor.
  if (s.spentMonthUsd + l.runReserveUsd > l.monthlyUsd)
    return deny("budget_month", 503, "The demo has used this month's API budget. The README has recorded runs and eval results.");
  if (s.spentTodayUsd + l.runReserveUsd > l.dailyUsd)
    return deny("budget_day", 503, "The demo has used today's API budget. It resets at 00:00 UTC.");
  if (s.visitorRuns24h >= l.runsPerVisitor)
    return deny("visitor_limit", 429, `You've used all ${l.runsPerVisitor} agent runs for the last 24 hours.`);
  if (s.ipRuns24h >= l.runsPerIp)
    return deny("ip_limit", 429, "Your network has used its agent runs for the last 24 hours.");
  if (s.ticketBusy)
    return deny("ticket_busy", 409, "Someone else is running the agent on this ticket. Try again in a few seconds, or write your own ticket.");
  if (s.inFlight >= l.maxConcurrent)
    return deny("busy", 429, "The agent is busy with other visitors. Try again in a few seconds.");
  return { ok: true };
}

const deny = (code: DenyCode, status: number, message: string): Admission => ({ ok: false, code, status, message });

/** Runs left for this visitor right now: the tighter of the cookie and IP allowances. */
export function runsLeft(s: Pick<UsageSnapshot, "visitorRuns24h" | "ipRuns24h">, l: DemoLimits): number {
  return Math.max(0, Math.min(l.runsPerVisitor - s.visitorRuns24h, l.runsPerIp - s.ipRuns24h));
}
