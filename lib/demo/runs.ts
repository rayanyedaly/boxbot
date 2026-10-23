// lib/demo/runs.ts
//
// Admission and settlement for public-demo agent runs. Every admitted run is a DemoRun
// row; the limits are counted from those rows. A run is settled with the cost its own
// model calls reported (the same figures written to LlmCall), so a ticket reset or the
// nightly reseed detaching LlmCall rows can't make spend disappear from the caps.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { demoLimits, type DemoLimits } from "./config";
import { decideAdmission, runsLeft, type Admission, type UsageSnapshot } from "./admission";
import type { Visitor } from "./visitor";

// Serializes every check-then-write on demo usage (run admission, ticket reset, ticket
// creation), so two concurrent requests can't both squeeze under a limit.
export const DEMO_LOCK_KEY = 0x62627431; // "bbt1"

type Tx = Prisma.TransactionClient;

export async function lockDemo(tx: Tx): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${DEMO_LOCK_KEY}::bigint)::text`;
}

const utcDayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const utcMonthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

export async function usageSnapshot(
  db: Tx | typeof prisma,
  who: { visitorId: string | null; ipHash: string },
  ticketId: string | null,
  l: DemoLimits = demoLimits(),
  now = new Date(),
): Promise<UsageSnapshot> {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const day = utcDayStart(now);
  const month = utcMonthStart(now);
  const live = new Date(now.getTime() - l.staleRunMs);
  const from = month < dayAgo ? month : dayAgo;
  // A RUNNING row counts at the reserve until it settles (a crashed run never does).
  const [r] = await db.$queryRaw<
    { visitor: number; ip: number; today: number; month: number; inflight: number; busy: number }[]
  >`
    SELECT
      count(*) FILTER (WHERE "visitorId" = ${who.visitorId ?? ""} AND "startedAt" > ${dayAgo})::int AS visitor,
      count(*) FILTER (WHERE "ipHash" = ${who.ipHash} AND "startedAt" > ${dayAgo})::int AS ip,
      coalesce(sum(CASE WHEN "status" = 'RUNNING' THEN ${l.runReserveUsd} ELSE "costUsd" END)
        FILTER (WHERE "startedAt" >= ${day}), 0)::float8 AS today,
      coalesce(sum(CASE WHEN "status" = 'RUNNING' THEN ${l.runReserveUsd} ELSE "costUsd" END)
        FILTER (WHERE "startedAt" >= ${month}), 0)::float8 AS month,
      count(*) FILTER (WHERE "status" = 'RUNNING' AND "startedAt" > ${live})::int AS inflight,
      count(*) FILTER (WHERE "status" = 'RUNNING' AND "startedAt" > ${live} AND "ticketId" = ${ticketId ?? ""})::int AS busy
    FROM "DemoRun"
    WHERE "startedAt" >= ${from}`;
  return {
    visitorRuns24h: r.visitor,
    ipRuns24h: r.ip,
    spentTodayUsd: r.today,
    spentMonthUsd: r.month,
    inFlight: r.inflight,
    ticketBusy: r.busy > 0,
  };
}

export type AdmitResult = (Admission & { ok: false }) | { ok: true; runId: string };

export async function admitRun(visitor: Visitor, ticketId: string): Promise<AdmitResult> {
  return prisma.$transaction(async (tx) => {
    await lockDemo(tx);
    const decision = decideAdmission(
      await usageSnapshot(tx, { visitorId: visitor.id, ipHash: visitor.ipHash }, ticketId),
      demoLimits(),
    );
    if (!decision.ok) return decision;
    const run = await tx.demoRun.create({ data: { visitorId: visitor.id, ipHash: visitor.ipHash, ticketId } });
    return { ok: true as const, runId: run.id };
  });
}

/**
 * Close a run with what it actually cost. A failed run is charged at least the reserve:
 * a model call can be billed before (or without) its cost being reported. Only a
 * RUNNING row is settled, so a row the nightly reseed already closed isn't overwritten.
 */
export async function finishRun(runId: string, ok: boolean, costUsd: number): Promise<void> {
  const cost = ok ? Math.max(0, costUsd) : Math.max(costUsd, demoLimits().runReserveUsd);
  await prisma.demoRun.updateMany({
    where: { id: runId, status: "RUNNING" },
    data: { status: ok ? "DONE" : "ERROR", costUsd: cost, finishedAt: new Date() },
  });
}

export type Quota = { runsLeft: number; runsLimit: number; resting: "day" | "month" | null };

/** What the sidebar shows. Read-only, no lock: a display, not a decision. */
export async function visitorQuota(who: { visitorId: string | null; ipHash: string }): Promise<Quota> {
  const l = demoLimits();
  const s = await usageSnapshot(prisma, who, null, l);
  const resting =
    s.spentMonthUsd + l.runReserveUsd > l.monthlyUsd ? "month" : s.spentTodayUsd + l.runReserveUsd > l.dailyUsd ? "day" : null;
  return { runsLeft: runsLeft(s, l), runsLimit: l.runsPerVisitor, resting };
}
