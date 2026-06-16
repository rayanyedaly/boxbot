// app/_components/dashboard/TokenSplitBar.tsx
import { formatTokens } from "@/lib/format";

export function TokenSplitBar({ input, output }: { input: number; output: number }) {
  const total = input + output || 1;
  const inputPct = (input / total) * 100;

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-neutral-100">
        {/* Widths are data-driven, so inline style (not a Tailwind class) is correct. */}
        <div className="bg-sky-500" style={{ width: `${inputPct}%` }} />
        <div className="bg-indigo-500" style={{ width: `${100 - inputPct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden />
          input {formatTokens(input)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          output {formatTokens(output)}
          <span className="h-2 w-2 rounded-full bg-indigo-500" aria-hidden />
        </span>
      </div>
    </div>
  );
}
