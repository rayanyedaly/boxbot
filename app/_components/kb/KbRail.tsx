// app/_components/kb/KbRail.tsx
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { KbGroup } from "@/lib/queries";

export function KbRail({ groups }: { groups: KbGroup[] }) {
  const pathname = usePathname();
  const activeSlug = pathname.startsWith("/kb/") ? decodeURIComponent(pathname.slice(4)) : "";
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const activeChip = useRef<HTMLAnchorElement>(null);

  // On phones the chip strip scrolls sideways; keep the current article's chip visible.
  useEffect(() => {
    activeChip.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [activeSlug]);

  return (
    <>
      {/* Phones and tablets: one swipeable row of articles. */}
      <nav
        aria-label="Articles"
        className="flex flex-none gap-1.5 overflow-x-auto border-b border-border bg-surface px-3 py-2.5 [scrollbar-width:none] lg:hidden"
      >
        {groups.flatMap((g) => g.items).map((it) => {
          const on = it.slug === activeSlug;
          return (
            <Link
              key={it.slug}
              href={`/kb/${it.slug}`}
              ref={on ? activeChip : undefined}
              aria-current={on ? "page" : undefined}
              className={`flex-none rounded-md border px-3 py-1.5 text-sm ${
                on ? "border-ink bg-surface-2 font-medium text-ink" : "border-border text-ink-3"
              }`}
            >
              {it.title}
            </Link>
          );
        })}
      </nav>
      <aside className="hidden h-full w-[280px] flex-none flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 flex-none items-center gap-2 border-b border-border px-5">
          <h2 className="text-lg font-semibold text-ink">Articles</h2>
          <span className="text-sm text-muted">{total}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {groups.map((g) => (
            <div key={g.category} className="mb-3">
              <div className="px-2.5 pb-1 text-xs font-medium capitalize text-muted">{g.category}</div>
              {g.items.map((it) => {
                const on = it.slug === activeSlug;
                return (
                  <Link
                    key={it.slug}
                    href={`/kb/${it.slug}`}
                    aria-current={on ? "page" : undefined}
                    className={`mb-px block rounded-md px-2.5 py-2 ${on ? "bg-surface-2" : "hover:bg-inset"}`}
                  >
                    <div className={`text-sm text-ink ${on ? "font-medium" : ""}`}>
                      {it.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="truncate font-mono text-2xs text-muted">{it.slug}</span>
                      <span className="flex-none text-2xs text-muted">{it.cites} cites</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
