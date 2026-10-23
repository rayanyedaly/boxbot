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
              className={`flex-none rounded-full border px-3 py-1.5 text-[12.5px] ${
                on ? "border-accent-bd bg-accent-soft font-semibold text-accent-ink" : "border-border text-ink-3"
              }`}
            >
              {it.title}
            </Link>
          );
        })}
      </nav>
      <aside className="hidden h-full w-[300px] flex-none flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 flex-none items-center gap-2 border-b border-border px-5">
          <h2 className="text-[15px] font-semibold text-ink">Articles</h2>
          <span className="font-mono text-[11px] text-faint">{total}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-1.5 py-3.5">
          {groups.map((g) => (
            <div key={g.category} className="mb-2">
              <div className="px-3.5 pb-1.5 font-mono text-[9.5px] font-semibold tracking-[0.06em] text-faint">
                {g.category}
              </div>
              {g.items.map((it) => {
                const on = it.slug === activeSlug;
                return (
                  <Link
                    key={it.slug}
                    href={`/kb/${it.slug}`}
                    className={`mb-px block rounded-lg px-3.5 py-[9px] ${on ? "bg-accent-soft" : "hover:bg-inset"}`}
                  >
                    <div className={`text-[13px] ${on ? "font-semibold text-accent-ink" : "font-medium text-ink"}`}>
                      {it.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="font-mono text-[10px]" style={{ color: on ? "var(--accent)" : "var(--faint)" }}>
                        {it.slug}
                      </span>
                      <span className="font-mono text-[9.5px] text-faint">{it.cites} cites</span>
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
