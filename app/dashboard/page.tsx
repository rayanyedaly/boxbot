import Link from "next/link";
import { demoContext } from "@/lib/demo/context";
import { AGENT_MODEL, SUMMARY_MODEL } from "@/lib/agent/llm";
import { dashboardStats } from "@/lib/queries";
import { formatUsd, formatTokens } from "@/lib/format";
import { SpendBars } from "@/app/_components/dashboard/SpendBars";
import { TokenBars } from "@/app/_components/dashboard/TokenSplitBar";
import { StatusPill } from "@/app/_components/Pills";
import { PageHeader } from "@/app/_components/PageHeader";
import { Card, SectionLabel, Stat } from "@/app/_components/ui";

export const dynamic = "force-dynamic";

// From the configured models, not hardcoded ids, so the tags follow ANTHROPIC_MODEL.
const MODEL_ROLE: Record<string, string> = {
  [SUMMARY_MODEL]: "compaction",
  [AGENT_MODEL]: "agent",
};

export default async function DashboardPage() {
  const demo = await demoContext();
  const s = await dashboardStats(demo ? { all: false, visitorId: demo.visitorId } : { all: true });
  const maxModel = Math.max(...s.spendByModel.map((m) => m.spend), 0.000001);

  return (
    <div className="flex h-full flex-col">
      <PageHeader sticky>
        <h1 className="text-lg font-semibold text-ink">Dashboard</h1>
        <span className="hidden text-sm text-muted sm:inline">Cost and observability</span>
      </PageHeader>

      <div className="flex-1 space-y-3.5 px-4 py-4 md:px-6 md:py-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border-2 lg:grid-cols-4">
          {[
            { label: "Total spend", value: formatUsd(s.totalSpend), sub: `${s.totalCalls} model calls` },
            { label: "Tickets resolved", value: String(s.resolvedCount), sub: `of ${s.totalTickets} tickets` },
            { label: "Avg cost per resolved", value: formatUsd(s.avgCostPerResolved), sub: `over ${s.resolvedCount} resolved ticket${s.resolvedCount === 1 ? "" : "s"}` },
            {
              label: "Tokens",
              value: formatTokens(s.inputTokens + s.outputTokens),
              sub: `${formatTokens(s.cacheReadTokens)} from cache`,
              subColor: s.cacheReadTokens > 0 ? "var(--resolved-fg)" : undefined,
            },
          ].map((k) => (
            <div key={k.label} className="bg-surface px-4 py-3.5 sm:px-5 sm:py-4">
              <Stat size="lg" {...k} />
            </div>
          ))}
        </div>

        {/* Spend by day + token economics */}
        <div className="grid gap-3.5 lg:grid-cols-[1.6fr_1fr]">
          <Card title="Spend by day" sub="USD, all model calls">
            <SpendBars data={s.spendByDay} />
          </Card>
          <Card title="Token economics">
            <TokenBars input={s.inputTokens} output={s.outputTokens} cache={s.cacheReadTokens} />
            <div className="mt-1 border-t border-border-2 pt-3">
              <SectionLabel>Saved by context compaction</SectionLabel>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-xl font-semibold" style={{ color: "var(--resolved-fg)" }}>
                  {formatUsd(s.compactionSavings.costSaved)}
                </span>
                <span className="text-xs text-ink-3">
                  {formatTokens(s.compactionSavings.tokensSaved)} tokens, {s.compactionSavings.count} compactions
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Spend by model + recent runs */}
        <div className="grid gap-3.5 lg:grid-cols-[1fr_1.9fr]">
          <Card title="Spend by model">
            {s.spendByModel.length === 0 && <p className="text-xs text-muted">No model calls yet.</p>}
            <div className="space-y-3">
              {s.spendByModel.map((m, i) => (
                <div key={m.model} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate font-mono text-xs font-medium text-ink">{m.model}</span>
                    <span className="text-2xs text-muted">
                      {MODEL_ROLE[m.model] ?? "model"}
                    </span>
                    <span className="ml-auto font-mono text-sm font-semibold text-ink">{formatUsd(m.spend)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-sm bg-inset">
                    <div
                      className="h-full rounded-sm"
                      style={{ width: `${(m.spend / maxModel) * 100}%`, background: i === 0 ? "var(--accent)" : "var(--bar)" }}
                    />
                  </div>
                  <div className="text-2xs text-muted">{m.calls} calls</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Recent agent runs">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_64px] gap-3 border-b border-border-2 pb-2 text-xs font-medium text-muted sm:grid-cols-[88px_minmax(0,1fr)_104px_64px]">
              <span className="hidden sm:block">Ticket</span>
              <span>Subject</span>
              <span>Status</span>
              <span className="text-right">Cost</span>
            </div>
            {s.recentRuns.length === 0 && (
              <p className="py-4 text-xs text-muted">No agent runs yet.</p>
            )}
            {s.recentRuns.map((r) => (
              <Link
                key={r.ticketId}
                href={`/tickets/${r.ticketId}`}
                aria-label={r.subject}
                className="grid grid-cols-[minmax(0,1fr)_auto_64px] items-center gap-3 border-b border-border-2 py-2.5 transition last:border-b-0 hover:bg-inset sm:grid-cols-[88px_minmax(0,1fr)_104px_64px]"
              >
                <span className="hidden font-mono text-xs text-muted sm:block">{r.ticketId.slice(0, 8)}</span>
                <span className="truncate text-sm text-ink">{r.subject}</span>
                <StatusPill status={r.status} />
                <span className="text-right font-mono text-xs font-medium text-ink">
                  {formatUsd(r.costUsd)}
                </span>
              </Link>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
