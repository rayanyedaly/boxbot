// app/admin/page.tsx
//
// Who tried the public demo: visitors, their optional name/company, runs and spend.
// Not linked anywhere; opened with /admin?token=<DEMO_ADMIN_TOKEN>. Without the env
// var set, or with a wrong token, it's a plain 404.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { adminTokenOk } from "@/lib/demo/admin";
import { decToNumber, formatUsd, timeAgo } from "@/lib/format";
import { PageHeader } from "@/app/_components/PageHeader";
import { Stat } from "@/app/_components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demo visitors", robots: { index: false, follow: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!adminTokenOk(token)) notFound();

  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [visitors, named, networks, today, thisMonth, rows] = await Promise.all([
    prisma.demoVisitor.count(),
    prisma.demoVisitor.count({ where: { OR: [{ name: { not: null } }, { company: { not: null } }] } }),
    prisma.demoVisitor.groupBy({ by: ["ipHash"] }).then((g) => g.length),
    prisma.demoRun.aggregate({ where: { startedAt: { gte: day } }, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.demoRun.aggregate({ where: { startedAt: { gte: month } }, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.$queryRaw<
      { id: string; name: string | null; company: string | null; ipHash: string; firstSeen: Date; lastSeen: Date; runs: number; spend: string; tickets: number }[]
    >`
      SELECT v."id", v."name", v."company", v."ipHash", v."firstSeen", v."lastSeen",
             COUNT(r."id")::int AS runs, COALESCE(SUM(r."costUsd"), 0) AS spend,
             (SELECT COUNT(*)::int FROM "Ticket" t WHERE t."visitorId" = v."id") AS tickets
      FROM "DemoVisitor" v LEFT JOIN "DemoRun" r ON r."visitorId" = v."id"
      GROUP BY v."id"
      ORDER BY v."lastSeen" DESC
      LIMIT 200`,
  ]);

  const stats = [
    { label: "Visitors", value: String(visitors), sub: `${named} left a name or company, ${networks} networks` },
    { label: "Runs today", value: String(today._count._all), sub: formatUsd(decToNumber(today._sum.costUsd)) },
    { label: "Runs this month", value: String(thisMonth._count._all), sub: formatUsd(decToNumber(thisMonth._sum.costUsd)) },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader>
        <h1 className="text-lg font-semibold text-ink">Demo visitors</h1>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-surface px-4 py-3">
              <Stat size="lg" {...s} />
            </div>
          ))}
        </div>

        <div className="mt-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] whitespace-nowrap bg-surface text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium" title="First 6 characters of the salted IP hash: same value = same network">
                  Network
                </th>
                <th className="px-4 py-2 font-medium">First seen</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
                <th className="px-4 py-2 text-right font-medium">Runs</th>
                <th className="px-4 py-2 text-right font-medium">Tickets</th>
                <th className="px-4 py-2 text-right font-medium">Spend</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    No visitors yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border-2">
                  <td className="px-4 py-2 text-ink">{r.name ?? <span className="text-muted">anonymous</span>}</td>
                  <td className="px-4 py-2 text-ink-2">{r.company ?? <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-3">{r.ipHash.slice(0, 6)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{r.firstSeen.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{timeAgo(r.lastSeen)}</td>
                  <td className="px-4 py-2 text-right font-mono text-ink">{r.runs}</td>
                  <td className="px-4 py-2 text-right font-mono text-ink">{r.tickets}</td>
                  <td className="px-4 py-2 text-right font-mono text-ink-2">{formatUsd(decToNumber(r.spend))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
