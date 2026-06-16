// app/_components/SidebarNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconInbox, IconGrid, IconBook } from "./icons";

const ITEMS = [
  { href: "/", label: "Inbox", Icon: IconInbox, key: "inbox" },
  { href: "/dashboard", label: "Dashboard", Icon: IconGrid, key: "dashboard" },
  { href: "/kb", label: "Knowledge base", Icon: IconBook, key: "kb" },
] as const;

export function SidebarNav({ inboxCount, kbCount }: { inboxCount: number; kbCount: number }) {
  const pathname = usePathname();
  const activeKey =
    pathname === "/" ? "inbox" : pathname.startsWith("/dashboard") ? "dashboard" : pathname.startsWith("/kb") ? "kb" : "inbox";

  return (
    <div className="flex flex-col gap-0.5 px-3 py-1.5">
      <div className="px-2.5 pt-2 pb-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] text-faint">
        Workspace
      </div>
      {ITEMS.map(({ href, label, Icon, key }) => {
        const on = activeKey === key;
        return (
          <Link
            key={key}
            href={href}
            className={`flex items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-[13.5px] tracking-[-0.01em] transition ${
              on ? "bg-accent-soft font-semibold text-accent-ink" : "font-medium text-ink-3 hover:bg-inset"
            }`}
          >
            <span className={on ? "text-accent" : "text-muted"}>
              <Icon size={16} />
            </span>
            <span className="flex-1">{label}</span>
            {key === "inbox" && inboxCount > 0 && (
              <span className="rounded-[5px] bg-accent-soft px-1.5 font-mono text-[10.5px] font-semibold text-accent">
                {inboxCount}
              </span>
            )}
            {key === "kb" && (
              <span className="px-1.5 font-mono text-[10.5px] text-muted">{kbCount}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
