// app/_components/dashboard/SpendBars.tsx
import { formatUsd } from "@/lib/format";

export function SpendBars({ data }: { data: { day: string; spend: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-neutral-400">No spend recorded yet.</p>;
  }
  const max = Math.max(...data.map((d) => d.spend)) || 1;

  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.day} className="flex items-center gap-3 text-xs">
          <span className="w-20 shrink-0 text-neutral-500">{d.day}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-neutral-100">
            <div
              className="h-full rounded bg-emerald-500"
              style={{ width: `${(d.spend / max) * 100}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right font-medium text-neutral-700">
            {formatUsd(d.spend)}
          </span>
        </div>
      ))}
    </div>
  );
}
