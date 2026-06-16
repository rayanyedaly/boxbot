import { kbList } from "@/lib/queries";
import { KbRail } from "@/app/_components/kb/KbRail";

export const dynamic = "force-dynamic";

export default async function KbLayout({ children }: { children: React.ReactNode }) {
  const groups = await kbList();
  return (
    <div className="flex h-full">
      <KbRail groups={groups} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
