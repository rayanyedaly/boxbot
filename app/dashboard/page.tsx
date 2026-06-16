import { dashboardStats } from "@/lib/queries";
import { formatUsd, formatTokens } from "@/lib/format";
import { StatCard } from "@/app/_components/dashboard/StatCard";
import { TokenSplitBar } from "@/app/_components/dashboard/TokenSplitBar";
import { SpendBars } from "@/app/_components/dashboard/SpendBars";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const s = await dashboardStats();

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Cost dashboard</h1>
        <p className="text-sm text-neutral-500">
          Every figure is computed from the <code>LlmCall</code> log — one row per
          model call, priced from the real token usage.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total spend"
          value={formatUsd(s.totalSpend)}
          sub={`${s.totalCalls} model calls`}
        />
        <StatCard
          label="Resolved"
          value={`${s.resolvedCount}`}
          sub={`of ${s.totalTickets} tickets`}
        />
        <StatCard
          label="Avg / resolved"
          value={formatUsd(s.avgCostPerResolved)}
          sub="cost per resolved ticket"
        />
        <StatCard
          label="Cache reads"
          value={formatTokens(s.cacheReadTokens)}
          sub="tokens served from cache"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 font-semibold">Input / output token split</h2>
          <TokenSplitBar input={s.inputTokens} output={s.outputTokens} />
        </section>
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 font-semibold">Spend per day (UTC)</h2>
          <SpendBars data={s.spendByDay} />
        </section>
      </div>

      <p className="text-xs text-neutral-400">
        “Resolved” = a ticket whose AI draft has been approved (flipped to SENT) by a
        human. Average cost aggregates spend over that set of tickets.
      </p>
    </main>
  );
}
