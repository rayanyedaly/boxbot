import { notFound } from "next/navigation";
import { kbArticle } from "@/lib/queries";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 border-r border-border-2 px-4 py-[13px] last:border-r-0">
      <div className="font-mono text-[9px] tracking-[0.05em] text-faint">{label}</div>
      <div className="mt-1 font-mono text-[18px] font-semibold text-ink">{value}</div>
    </div>
  );
}

export default async function KbArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = await kbArticle(slug);
  if (!a) notFound();

  const category = (a.tags[0] ?? "general").toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 flex h-14 flex-none items-center gap-2 border-b border-border bg-surface px-6">
        <span className="text-[13px] text-muted">{category}</span>
        <span className="text-faint">/</span>
        <span className="font-mono text-[12px] text-ink-3">{a.slug}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto py-[30px]">
        <article className="mx-auto" style={{ width: 640, maxWidth: "88%" }}>
          <div className="mb-2.5 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-accent">
            {category}
          </div>
          <h1 className="m-0 text-[27px] font-semibold tracking-[-0.025em] text-ink">{a.title}</h1>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-muted">Updated {formatDate(a.createdAt)}</span>
            {a.tags.map((t) => (
              <span key={t} className="rounded-[5px] bg-inset px-2 py-0.5 text-[11px] text-ink-3">
                {t}
              </span>
            ))}
          </div>

          <div className="mt-6 mb-6 flex overflow-hidden rounded-[10px] border border-border bg-surface">
            <Stat label="UPDATED" value={formatDate(a.createdAt)} />
            <Stat label="TAGS" value={String(a.tags.length)} />
            <Stat label="AGENT CITES" value={String(a.cites)} />
          </div>

          <p className="whitespace-pre-line text-[14.5px] leading-[1.7] text-ink">{a.body}</p>
        </article>
      </div>
    </div>
  );
}
