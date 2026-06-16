// app/_components/AgentTracePanel.tsx
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AgentEvent } from "@/lib/agent/loop";
import type { TicketTrace } from "@/lib/queries";
import { formatUsd } from "@/lib/format";
import { IconActivity, IconPanelCollapse, IconCheck } from "./icons";

type DoneSummary = {
  type: "done";
  stopReason: string | null;
  toolCalls: string[];
  llmCalls: number;
  totalCostUsd: number;
  compactions: number;
  tokensSaved: number;
  hitIterationCap: boolean;
};
type StreamMsg = AgentEvent | DoneSummary | { type: "error"; message: string };

function SummaryCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="font-mono text-[9.5px] tracking-[0.05em] text-faint">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold text-ink">{value}</div>
      {sub && <div className="font-mono text-[10px] text-faint">{sub}</div>}
    </div>
  );
}

export function AgentTracePanel({ ticketId, trace }: { ticketId: string; trace: TicketTrace }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<{ id: number; event: AgentEvent }[]>([]);
  const [summary, setSummary] = useState<DoneSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(0);

  function handle(msg: StreamMsg) {
    if (msg.type === "done") return setSummary(msg);
    if (msg.type === "error") return setError(msg.message);
    setEvents((prev) => {
      if (msg.type === "text") {
        const last = prev[prev.length - 1];
        if (last && last.event.type === "text") {
          const merged = prev.slice();
          merged[merged.length - 1] = { id: last.id, event: { type: "text", text: last.event.text + msg.text } };
          return merged;
        }
      }
      return [...prev, { id: idRef.current++, event: msg }];
    });
  }
  function parseLine(line: string) {
    const s = line.trim();
    if (!s) return;
    try {
      handle(JSON.parse(s) as StreamMsg);
    } catch {
      /* skip an unparseable line */
    }
  }

  async function run() {
    if (running) return;
    if (!window.confirm("Run the agent on this ticket? This makes billed API calls.")) return;
    setRunning(true);
    setEvents([]);
    setSummary(null);
    setError(null);
    idRef.current = 0;
    try {
      const res = await fetch(`/api/tickets/${ticketId}/run`, { method: "POST" });
      if (!res.ok || !res.body) throw new Error(`run failed (HTTP ${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) parseLine(line);
      }
      parseLine(buffer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  const showLive = running || events.length > 0;
  const cost = summary ? summary.totalCostUsd : trace.costUsd;
  const toolN = summary ? summary.toolCalls.length : trace.toolCalls;
  const callsN = summary ? summary.llmCalls : trace.modelCalls;

  if (collapsed) {
    return (
      <aside
        onClick={() => setCollapsed(false)}
        className="flex h-full w-[54px] flex-none cursor-pointer flex-col items-center gap-4 border-l border-border bg-surface pt-4"
      >
        <span className="text-faint">
          <IconPanelCollapse size={16} />
        </span>
        <span
          className="font-mono text-[10px] font-semibold tracking-[0.1em] text-ink-3"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          AGENT RUN
        </span>
        <span
          className="font-mono text-[10px] text-faint"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          {formatUsd(cost)}
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[374px] flex-none flex-col border-l border-border bg-surface">
      {/* Header */}
      <div className="flex h-[54px] flex-none items-center gap-2 border-b border-border-2 px-[18px]">
        <span className="text-ink-3">
          <IconActivity size={15} />
        </span>
        <span className="flex-1 text-sm font-semibold text-ink">Agent run</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-faint hover:text-ink-3"
          aria-label="Collapse trace"
        >
          <IconPanelCollapse size={16} />
        </button>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-3 px-[18px] py-3.5">
        <SummaryCell label="COST" value={formatUsd(cost)} />
        <SummaryCell label="LATENCY" value={`${(trace.latencyMs / 1000).toFixed(1)}s`} />
        <SummaryCell label="MODEL CALLS" value={String(callsN)} />
        <SummaryCell label="TOOL CALLS" value={String(toolN)} />
      </div>

      {/* Timeline */}
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pt-1">
        <div className="pb-2 font-mono text-[9.5px] font-semibold tracking-[0.06em] text-faint">
          {showLive ? "LIVE RUN" : `TOOL CHAIN · ${trace.steps.length} STEPS`}
        </div>

        {!showLive && !trace.hasRun && (
          <p className="py-6 text-[12px] text-muted">
            No agent run yet. Run the agent to draft a reply.
          </p>
        )}

        {!showLive &&
          trace.steps.map((s, i) => {
            const terminal = i === trace.steps.length - 1 && s.kind === "tool";
            if (s.kind === "compaction") {
              return (
                <div key={s.index} className="relative pb-3.5 pl-8">
                  <span className="absolute left-[3px] top-0.5 flex h-4 w-4 items-center justify-center rounded-[5px] border border-dashed border-accent-bd bg-accent-soft" />
                  <div className="rounded-lg border border-dashed border-accent-bd bg-accent-soft px-2.5 py-2">
                    <div className="font-mono text-[9.5px] font-semibold tracking-[0.06em] text-accent-ink">
                      CONTEXT COMPACTED
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-muted">{s.detail}</div>
                  </div>
                </div>
              );
            }
            return (
              <div key={s.index} className="relative pb-3.5 pl-8">
                {i < trace.steps.length - 1 && (
                  <span className="absolute left-[10px] top-5 bottom-[-3px] w-px bg-border-2" />
                )}
                <span
                  className="absolute left-0.5 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full font-mono text-[9px] font-bold"
                  style={
                    terminal
                      ? { background: "var(--accent)", color: "#fff" }
                      : { background: "var(--surface)", border: "1.5px solid var(--border)", color: "var(--muted)" }
                  }
                >
                  {terminal ? <IconCheck size={10} /> : s.index}
                </span>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[12px] font-semibold text-ink">{s.name}</span>
                </div>
                {s.detail && (
                  <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted">{s.detail}</div>
                )}
              </div>
            );
          })}

        {showLive &&
          events.map(({ id, event }) => <LiveRow key={id} event={event} />)}
        {running && events.length === 0 && <p className="py-2 text-[11px] text-faint">Starting run…</p>}
        {error && <p className="py-2 font-mono text-[11px] text-[color:var(--escal-fg)]">⚠ {error}</p>}
      </div>

      {/* Footer */}
      <div className="flex flex-none items-center justify-between border-t border-border-2 px-[18px] py-3">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {running ? "Running…" : trace.hasRun ? "Re-run agent" : "Run agent"}
        </button>
        {summary && (
          <span className="font-mono text-[10px] text-faint">
            {summary.compactions > 0 ? `${summary.compactions} compaction · ` : ""}
            {summary.stopReason}
          </span>
        )}
      </div>
    </aside>
  );
}

function LiveRow({ event }: { event: AgentEvent }) {
  const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
  switch (event.type) {
    case "text":
      return <p className="pb-2 text-[12px] leading-relaxed text-ink-2">{event.text}</p>;
    case "tool_use":
      return (
        <div className="pb-1.5 font-mono text-[11px]">
          <span className="font-semibold text-accent-ink">{event.name}</span>
          <span className="text-faint">({trunc(JSON.stringify(event.input), 60)})</span>
        </div>
      );
    case "tool_result":
      return (
        <div className="pb-2 font-mono text-[10.5px] text-muted">↳ {trunc(JSON.stringify(event.result), 90)}</div>
      );
    case "llm_call":
      return (
        <div className="pb-2 font-mono text-[10.5px] text-faint">
          {event.model} · ${event.costUsd.toFixed(6)}
        </div>
      );
    case "compaction":
      return (
        <div className="pb-2 font-mono text-[10.5px]" style={{ color: "var(--accent-ink)" }}>
          context compacted: {event.tokensBefore}→{event.tokensAfter} (saved {event.tokensSaved})
        </div>
      );
    default:
      return null;
  }
}
