// app/_components/dashboard/TokenSplitBar.tsx
import { formatTokens } from "@/lib/format";

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-ink-3">{label}</span>
        <span className="font-mono text-xs font-medium text-ink">{formatTokens(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-sm bg-inset">
        <div
          className="h-full rounded-sm"
          style={{ width: `${(value / total) * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function TokenBars({
  input,
  cacheWrite,
  cacheRead,
  output,
}: {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}) {
  // Four disjoint parts: the API's input_tokens already excludes cache reads and writes.
  const total = input + cacheWrite + cacheRead + output || 1;
  return (
    <div>
      <Bar label="Input (uncached)" value={input} total={total} color="var(--accent)" />
      <Bar label="Cache write" value={cacheWrite} total={total} color="var(--pending)" />
      <Bar label="Cache read" value={cacheRead} total={total} color="var(--resolved)" />
      <Bar label="Output" value={output} total={total} color="var(--bar)" />
    </div>
  );
}
