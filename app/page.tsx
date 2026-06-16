import Link from "next/link";
import { inboxRows, type InboxRow } from "@/lib/queries";
import { StatusBadge, PriorityPill, ChannelTag, PlanTag } from "@/app/_components/Pills";
import { formatUsd, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const COLS = "grid-cols-[132px_minmax(0,1fr)_226px_52px]";

const TABS = [
  { key: "all", label: "All" },
  { key: "needs-review", label: "Needs review" },
  { key: "escalated", label: "Escalated" },
  { key: "resolved", label: "Resolved" },
] as const;

const OUTCOME: Record<InboxRow["outcome"], { label: string; token: string } | null> = {
  draft: { label: "Draft ready", token: "open" },
  sent: { label: "Sent", token: "resolved" },
  escalated: { label: "Escalated", token: "escal" },
  none: null,
};

function matchesFilter(r: InboxRow, filter: string): boolean {
  if (filter === "needs-review") return r.hasDraft;
  if (filter === "escalated") return r.status === "ESCALATED";
  if (filter === "resolved") return r.outcome === "sent";
  return true;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "all" } = await searchParams;
  const rows = await inboxRows();

  const counts = {
    all: rows.length,
    "needs-review": rows.filter((r) => r.hasDraft).length,
    escalated: rows.filter((r) => r.status === "ESCALATED").length,
    resolved: rows.filter((r) => r.outcome === "sent").length,
  } as Record<string, number>;
  const openCount = rows.filter((r) => r.status === "OPEN").length;
  const list = rows.filter((r) => matchesFilter(r, filter));

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-14 flex-none items-center gap-3.5 border-b border-border bg-surface px-6">
        <h1 className="text-base font-semibold text-ink">Inbox</h1>
        <span className="font-mono text-[11px] text-muted">{openCount} open</span>
      </header>

      {/* Filter tabs */}
      <div className="flex h-[46px] flex-none items-center gap-1 border-b border-border bg-surface px-5">
        {TABS.map((t) => {
          const on = filter === t.key;
          return (
            <Link
              key={t.key}
              href={t.key === "all" ? "/" : `/?filter=${t.key}`}
              className={`flex h-[30px] items-center gap-2 rounded-[7px] px-3 text-[13px] transition ${
                on ? "bg-accent-soft font-semibold text-accent-ink" : "text-ink-3 hover:bg-inset"
              }`}
            >
              {t.label}
              <span
                className={`rounded-[5px] px-1.5 font-mono text-[10.5px] font-semibold text-accent ${
                  on ? "bg-surface" : "bg-accent-soft"
                }`}
              >
                {counts[t.key] ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Column headers */}
      <div
        className={`grid ${COLS} flex-none gap-3.5 border-b border-border-2 bg-surface-2 px-6 py-[9px] font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-faint`}
      >
        <span>Status</span>
        <span>Ticket</span>
        <span>Agent run</span>
        <span className="text-right">Age</span>
      </div>

      {/* Rows */}
      <div>
        {list.length === 0 && (
          <p className="px-6 py-16 text-center text-sm text-muted">No tickets in this view.</p>
        )}
        {list.map((r) => {
          const o = OUTCOME[r.outcome];
          return (
            <Link
              key={r.id}
              href={`/tickets/${r.id}`}
              className={`grid ${COLS} items-center gap-3.5 border-b border-border-2 px-6 py-[13px] transition hover:bg-inset`}
            >
              {/* Status */}
              <div>
                <StatusBadge status={r.status} />
              </div>

              {/* Ticket */}
              <div className="flex min-w-0 items-center gap-2">
                {r.hasDraft && <span className="h-1.5 w-1.5 flex-none rounded-full bg-accent" />}
                <div className="min-w-0">
                  <p
                    className={`truncate text-[13.5px] text-ink ${r.hasDraft ? "font-semibold" : "font-medium"}`}
                  >
                    {r.subject}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[12px] text-ink-3">{r.customerName}</span>
                    <PlanTag plan={r.customerPlan} />
                    <PriorityPill priority={r.priority} />
                    <ChannelTag channel={r.channel} />
                  </div>
                </div>
              </div>

              {/* Agent run */}
              <div className="flex min-w-0 items-center gap-2">
                {o ? (
                  <span
                    className="flex-none rounded-md px-2 py-[3px] text-[11px] font-semibold"
                    style={{ color: `var(--${o.token}-fg)`, background: `var(--${o.token}-bg)` }}
                  >
                    {o.label}
                  </span>
                ) : (
                  <span className="font-mono text-[10.5px] text-faint">no run</span>
                )}
                {r.toolCount > 0 && (
                  <span className="font-mono text-[10.5px] text-faint">{r.toolCount} tools</span>
                )}
                {r.costUsd > 0 && (
                  <span className="font-mono text-[10.5px] text-muted">{formatUsd(r.costUsd)}</span>
                )}
              </div>

              {/* Age */}
              <span className="text-right font-mono text-[11px] text-faint">{timeAgo(r.updatedAt)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
