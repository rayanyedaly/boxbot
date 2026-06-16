// app/_components/Sidebar.tsx (Server Component)
//
// The persistent app shell: brand, search affordance, nav, live agent-status card,
// appearance toggle, user row. Data is read server-side; only SidebarNav (active
// state) and ThemeToggle are client islands.

import { sidebarStats } from "@/lib/queries";
import { formatUsd } from "@/lib/format";
import { SidebarNav } from "./SidebarNav";
import { ThemeToggle } from "./ThemeToggle";
import { IconSearch, IconChevronUpDown } from "./icons";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export async function Sidebar() {
  const s = await sidebarStats();

  return (
    <aside className="flex h-full w-[236px] flex-none flex-col border-r border-border bg-surface">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-border-2 px-4 pb-3 pt-4">
        <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg bg-accent shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]">
          <div className="h-[11px] w-[11px] rounded-[3px] border-2 border-white" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[14.5px] font-semibold tracking-[-0.02em] text-ink">BoxBot</span>
          <span className="mt-0.5 font-mono text-[9.5px] font-medium tracking-[0.06em] text-faint">
            v0.4 · ALPHA
          </span>
        </div>
      </div>

      {/* Search affordance */}
      <div className="px-3 pb-2 pt-3">
        <div className="flex h-8 items-center gap-2 rounded-lg border border-border bg-inset px-2.5 text-[12.5px] text-muted">
          <IconSearch size={13} />
          <span className="flex-1">Search tickets</span>
          <span className="rounded border border-border px-1 font-mono text-[10px] text-faint">⌘K</span>
        </div>
      </div>

      <SidebarNav inboxCount={s.openCount} kbCount={s.kbCount} />

      <div className="flex-1" />

      {/* Agent status */}
      <div className="mx-3 mb-2.5 rounded-[9px] border border-border bg-surface-2 px-3 py-[11px]">
        <div className="mb-2 flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--resolved)", boxShadow: "0 0 0 3px var(--resolved-bg)" }}
          />
          <span className="font-mono text-[9.5px] font-semibold tracking-[0.06em] text-ink-3">
            AGENT ONLINE
          </span>
        </div>
        <div className="mb-1.5 font-mono text-[11px] text-ink">{MODEL}</div>
        <div className="flex items-center justify-between font-mono text-[10.5px] text-muted">
          <span>today</span>
          <span>
            <span className="font-semibold text-ink">{formatUsd(s.todaySpend)}</span> · {s.todayCalls} calls
          </span>
        </div>
      </div>

      {/* Appearance */}
      <div className="mx-3 mb-2">
        <div className="px-0.5 pb-1.5 font-mono text-[9px] tracking-[0.07em] text-faint">APPEARANCE</div>
        <ThemeToggle />
      </div>

      {/* User */}
      <div className="flex items-center gap-2.5 border-t border-border-2 px-3.5 py-2.5">
        <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-accent-soft text-[10.5px] font-semibold text-accent">
          RA
        </div>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[12.5px] font-medium text-ink">Rafael Adeyemi</span>
          <span className="text-[10.5px] text-muted">Support lead</span>
        </div>
        <span className="text-faint">
          <IconChevronUpDown size={14} />
        </span>
      </div>
    </aside>
  );
}
