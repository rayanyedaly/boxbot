// app/_components/kb/KbRail.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { KbGroup } from "@/lib/queries";

export function KbRail({ groups }: { groups: KbGroup[] }) {
  const pathname = usePathname();
  const activeSlug = pathname.startsWith("/kb/") ? decodeURIComponent(pathname.slice(4)) : "";
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <aside className="flex h-full w-[300px] flex-none flex-col border-r border-border bg-surface">
      <div className="flex h-14 flex-none items-center gap-2 border-b border-border px-5">
        <h1 className="text-[15px] font-semibold text-ink">Articles</h1>
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
  );
}
