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
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-3 py-3">
      {ITEMS.map(({ href, label, Icon, key }) => {
        const on = activeKey === key;
        return (
          <Link
            key={key}
            href={href}
            data-tour={`nav-${key}`}
            aria-current={on ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition ${
              on ? "bg-surface-2 font-medium text-ink" : "text-ink-3 hover:bg-inset hover:text-ink"
            }`}
          >
            <span className={on ? "text-ink" : "text-muted"}>
              <Icon size={16} />
            </span>
            <span className="flex-1">{label}</span>
            {key === "inbox" && inboxCount > 0 && (
              <span className="text-xs tabular-nums text-muted">{inboxCount}</span>
            )}
            {key === "kb" && (
              <span className="text-xs tabular-nums text-muted">{kbCount}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
