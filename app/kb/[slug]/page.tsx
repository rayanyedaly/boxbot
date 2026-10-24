import { notFound } from "next/navigation";
import { kbArticle } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/app/_components/PageHeader";

export const dynamic = "force-dynamic";

export default async function KbArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = await kbArticle(slug);
  if (!a) notFound();

  const tag = a.tags[0] ?? "general";
  const category = tag.charAt(0).toUpperCase() + tag.slice(1);

  return (
    <div className="flex h-full flex-col">
      <PageHeader sticky>
        <span className="text-sm text-muted">{category}</span>
        <span className="text-faint">/</span>
        <span className="truncate font-mono text-xs text-ink-3">{a.slug}</span>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:py-8">
        <article className="mx-auto w-full max-w-[640px]">
          <h1 className="m-0 text-2xl font-semibold text-ink">{a.title}</h1>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">
              Updated {formatDate(a.createdAt)}, cited by the agent {a.cites} {a.cites === 1 ? "time" : "times"}
            </span>
            {a.tags.map((t) => (
              <span key={t} className="rounded-sm border border-border px-1.5 text-xs text-ink-3">
                {t}
              </span>
            ))}
          </div>

          <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-ink">{a.body}</p>
        </article>
      </div>
    </div>
  );
}
