import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function KbIndex() {
  const first = await prisma.kbArticle.findFirst({
    orderBy: { title: "asc" },
    select: { slug: true },
  });
  if (first) redirect(`/kb/${first.slug}`);
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted">
      No knowledge base articles yet.
    </div>
  );
}
