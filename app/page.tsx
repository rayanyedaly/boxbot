import Link from "next/link";
import { inboxRows, type InboxRow } from "@/lib/queries";
import { StatusBadge, PriorityPill, ChannelTag, PlanTag, DemoTag } from "@/app/_components/Pills";
import { formatUsd, timeAgo } from "@/lib/format";
import { IconPlus } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/PageHeader";
import { buttonClass } from "@/app/_components/ui";
import { demoContext } from "@/lib/demo/context";
import { visibleTickets } from "@/lib/demo/tickets";

// The tour starts on this one: the refund chase that needs the longest tool chain.
const FEATURED_SUBJECT = "Where's my refund?";

export const dynamic = "force-dynamic";

// From md up: a table. Below md each row stacks: status · age, then the ticket, then the run.
const COLS = "md:grid-cols-[132px_minmax(0,1fr)_226px_52px]";

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
  const demo = await demoContext();
  const rows = await inboxRows(visibleTickets(demo?.visitorId ?? null));
  const featuredId = rows.find((r) => r.subject === FEATURED_SUBJECT && !r.visitorId)?.id;

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
      <PageHeader
        sticky
        actions={
          // Below lg the top bar carries this button.
          <Link
            href="/tickets/new"
            className={`${demo ? "demo-glow " : ""}${buttonClass()} h-8 px-3 text-sm max-lg:hidden`}
          >
            <IconPlus size={14} /> Write your own ticket
          </Link>
        }
      >
        <h1 className="text-lg font-semibold text-ink">Inbox</h1>
        <span className="text-sm text-muted">{openCount} open</span>
      </PageHeader>

      {/* Filter tabs */}
      <div className="flex h-11 flex-none items-end gap-5 overflow-x-auto border-b border-border bg-surface px-4 [scrollbar-width:none] md:px-6">
        {TABS.map((t) => {
          const on = filter === t.key;
          return (
            <Link
              key={t.key}
              href={t.key === "all" ? "/" : `/?filter=${t.key}`}
              aria-current={on ? "page" : undefined}
              className={`-mb-px flex h-full flex-none items-center gap-1.5 border-b-2 text-sm transition ${
                on ? "border-ink font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink"
              }`}
            >
              {t.label}
              <span className="tabular-nums text-muted">{counts[t.key] ?? 0}</span>
            </Link>
          );
        })}
      </div>

      {/* Column headers */}
      <div
        className={`hidden md:grid ${COLS} flex-none gap-3.5 border-b border-border-2 px-6 py-2 text-xs font-medium text-muted`}
      >
        <span>Status</span>
        <span>Ticket</span>
        <span>Agent run</span>
        <span className="text-right">Age</span>
      </div>

      {/* Rows */}
      <div>
        {list.length === 0 && (
          <p className="px-4 py-16 text-center text-sm text-muted md:px-6">No tickets in this view.</p>
        )}
        {list.map((r) => {
          const o = OUTCOME[r.outcome];
          return (
            <Link
              key={r.id}
              href={`/tickets/${r.id}`}
              aria-label={r.subject}
              data-tour={r.id === featuredId ? "featured-ticket" : undefined}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-border-2 px-4 py-3 transition hover:bg-inset md:gap-3.5 md:px-6 md:py-3 ${COLS}`}
            >
              {/* Status */}
              <div className="col-start-1 row-start-1 md:col-auto md:row-auto">
                <StatusBadge status={r.status} />
              </div>

              {/* Ticket */}
              <div className="col-span-2 row-start-2 flex min-w-0 items-center gap-2 md:col-auto md:row-auto">
                {r.hasDraft && <span className="h-1.5 w-1.5 flex-none rounded-full bg-accent" />}
                <div className="min-w-0">
                  <p
                    className={`line-clamp-2 text-base text-ink md:truncate md:text-sm ${r.hasDraft ? "font-semibold" : "font-medium"}`}
                  >
                    {r.subject}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {demo && r.id === featuredId && <DemoTag label="Start here" solid />}
                    {r.visitorId && <DemoTag label="Yours" />}
                    <span className="text-xs text-ink-2">{r.customerName}</span>
                    <PlanTag plan={r.customerPlan} />
                    <PriorityPill priority={r.priority} />
                    <ChannelTag channel={r.channel} />
                  </div>
                </div>
              </div>

              {/* Agent run (on phones, only once there's something to show) */}
              <div className={`col-span-2 row-start-3 min-w-0 items-center gap-2 md:col-auto md:row-auto ${o ? "flex" : "hidden md:flex"}`}>
                {o ? (
                  <span className="flex-none text-xs font-medium" style={{ color: `var(--${o.token}-fg)` }}>
                    {o.label}
                  </span>
                ) : (
                  <span className="text-xs text-muted">No run</span>
                )}
                {r.toolCount > 0 && (
                  <span className="text-xs text-muted">{r.toolCount} tools</span>
                )}
                {r.costUsd > 0 && (
                  <span className="font-mono text-xs text-muted">{formatUsd(r.costUsd)}</span>
                )}
              </div>

              {/* Age */}
              <span className="col-start-2 row-start-1 text-right text-xs tabular-nums text-muted md:col-auto md:row-auto">
                {timeAgo(r.updatedAt)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
