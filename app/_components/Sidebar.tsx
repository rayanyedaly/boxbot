// app/_components/Sidebar.tsx (Server Component)
//
// The persistent left rail: brand, nav, the public-demo card and today's agent usage.
// Data is read server-side; SidebarNav (active state) is the only client island.

import Link from "next/link";
import { sidebarStats } from "@/lib/queries";
import { formatUsd } from "@/lib/format";
import { AGENT_MODEL } from "@/lib/agent/llm";
import { demoContext } from "@/lib/demo/context";
import { visibleTickets } from "@/lib/demo/tickets";
import { SidebarNav } from "./SidebarNav";
import { ReplayTourButton } from "./DemoTour";
import { BrandMark } from "./BrandMark";
import { IconPlus } from "./icons";
import { buttonClass } from "./ui";

export async function Sidebar() {
  const demo = await demoContext();
  const s = await sidebarStats(visibleTickets(demo?.visitorId ?? null));

  return (
    <aside className="flex h-full w-[232px] flex-none flex-col border-r border-border bg-surface">
      {/* Brand: same height as the page headers so the rules line up */}
      <div className="flex h-14 flex-none items-center gap-2.5 border-b border-border px-4">
        <BrandMark />
        <span className="text-base font-semibold text-ink">BoxBot</span>
      </div>

      <SidebarNav inboxCount={s.openCount} kbCount={s.kbCount} />

      <div className="flex-1" />

      {/* Public demo: runs left + the "write your own" call to action */}
      {demo && (
        <div className="mx-3 mb-3 rounded-lg border border-border px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-2">Public demo</span>
            <ReplayTourButton />
          </div>
          <div className="mt-1 text-xs text-ink-3">
            {demo.quota.resting ? (
              <>Today&apos;s API budget is used up. Runs are back {demo.quota.resting === "day" ? "at 00:00 UTC" : "next month"}.</>
            ) : (
              <>
                <span className="font-mono font-medium text-ink">
                  {demo.quota.runsLeft}/{demo.quota.runsLimit}
                </span>{" "}
                agent runs left
              </>
            )}
          </div>
          <Link href="/tickets/new" data-tour="new-ticket" className={`${buttonClass()} mt-2.5 h-8 w-full text-sm`}>
            <IconPlus size={14} /> Write your own ticket
          </Link>
        </div>
      )}

      {/* Agent usage today */}
      <div className="border-t border-border px-4 py-3 text-xs">
        <div className="break-all font-mono text-ink-2">{AGENT_MODEL}</div>
        <div className="mt-1 text-muted">
          Today <span className="font-mono text-ink-2">{formatUsd(s.todaySpend)}</span> · {s.todayCalls} calls
        </div>
      </div>
    </aside>
  );
}
