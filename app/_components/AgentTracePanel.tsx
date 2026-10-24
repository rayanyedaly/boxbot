// app/_components/AgentTracePanel.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AgentEvent } from "@/lib/agent/loop";
import type { TicketTrace } from "@/lib/queries";
import { formatUsd } from "@/lib/format";
import { emitRun } from "@/lib/demo/events";
import type { Quota } from "@/lib/demo/runs";
import { IconActivity, IconPanelCollapse, IconCheck, IconWarning } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { buttonClass, SectionLabel, Stat } from "./ui";

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

export function AgentTracePanel({
  ticketId,
  trace,
  quota,
}: {
  ticketId: string;
  trace: TicketTrace;
  /** Set in the public demo: runs are capped, so show what's left and skip the confirm. */
  quota?: Quota | null;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<{ id: number; event: AgentEvent }[]>([]);
  const [summary, setSummary] = useState<DoneSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(0);
  const completed = useRef(false); // the stream delivered its "done" summary
  const awaitingRefresh = useRef<boolean | null>(null); // the finished run's ok, until the refresh lands

  // A reset (the ticket had a run, now it doesn't) clears the last run's live view, which
  // would otherwise sit next to a ticket that says "No agent run yet".
  const [seenTrace, setSeenTrace] = useState(trace);
  if (trace !== seenTrace) {
    setSeenTrace(trace);
    if (seenTrace.hasRun && !trace.hasRun && !running) {
      setEvents([]);
      setSummary(null);
      setError(null);
    }
  }

  // The page re-renders with the run's result after router.refresh(); tell the tour.
  useEffect(() => {
    if (awaitingRefresh.current === null) return;
    const ok = awaitingRefresh.current;
    awaitingRefresh.current = null;
    emitRun("refreshed", ok);
  }, [trace]);

  function handle(msg: StreamMsg) {
    if (msg.type === "done") {
      completed.current = true;
      return setSummary(msg);
    }
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
    if (!quota && !window.confirm("Run the agent on this ticket? This makes billed API calls.")) return;
    setRunning(true);
    setEvents([]);
    setSummary(null);
    setError(null);
    idRef.current = 0;
    completed.current = false;
    let admitted = false;
    try {
      const res = await fetch(`/api/tickets/${ticketId}/run`, { method: "POST" });
      if (!res.ok || !res.body) {
        // Demo refusals (limits, budget, busy ticket) come back as JSON with a message.
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `run failed (HTTP ${res.status})`);
      }
      admitted = true;
      emitRun("start");
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
      const ok = completed.current;
      emitRun("done", ok);
      if (admitted) awaitingRefresh.current = ok;
      router.refresh();
    }
  }

  const showLive = running || events.length > 0;
  const cost = summary ? summary.totalCostUsd : trace.costUsd;
  const toolN = summary ? summary.toolCalls.length : trace.toolCalls;
  const callsN = summary ? summary.llmCalls : trace.modelCalls;

  if (collapsed) {
    // Collapsing is desktop-only, so this strip still owns the top-right theme toggle.
    return (
      <div className="flex h-full w-14 flex-none flex-col items-center border-l border-border bg-surface">
        <div className="flex h-14 w-full flex-none items-center justify-center border-b border-border">
          <ThemeToggle className="hidden h-8 w-8 lg:flex" />
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand agent run panel"
          aria-expanded={false}
          title="Expand agent run panel"
          className="flex w-full flex-1 cursor-pointer flex-col items-center gap-2 pt-3 text-muted hover:bg-inset hover:text-ink"
        >
          <IconActivity size={16} />
          <span className="font-mono text-2xs">{formatUsd(cost)}</span>
        </button>
      </div>
    );
  }

  return (
    <aside
      data-tour="trace"
      className="flex w-full flex-col border-t border-border bg-surface pb-[68px] lg:h-full lg:w-[374px] lg:flex-none lg:border-l lg:border-t-0 lg:pb-0"
    >
      {/* Header */}
      <div className="flex h-14 flex-none items-center gap-1 border-b border-border pl-4 pr-3">
        <span className="mr-1 text-ink-3">
          <IconActivity size={15} />
        </span>
        <span className="flex-1 text-sm font-semibold text-ink">Agent run</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="hidden h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-inset hover:text-ink lg:flex"
          aria-label="Collapse agent run panel"
          aria-expanded={true}
          title="Collapse agent run panel"
        >
          <IconPanelCollapse size={16} />
        </button>
        <ThemeToggle className="hidden h-8 w-8 lg:flex" />
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-b border-border-2 px-4 py-4">
        <Stat label="Cost" value={formatUsd(cost)} />
        <Stat label="Latency" value={`${(trace.latencyMs / 1000).toFixed(1)}s`} />
        <Stat label="Model calls" value={String(callsN)} />
        <Stat label="Tool calls" value={String(toolN)} />
      </div>

      {/* Timeline */}
      <div
        className="px-4 pt-3.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
        aria-live="polite"
        aria-busy={running}
      >
        <SectionLabel className="pb-2.5">
          {showLive ? "Live run" : `Tool chain, ${trace.steps.length} steps`}
        </SectionLabel>

        {!showLive && !trace.hasRun && (
          <p className="py-6 text-xs text-muted">
            No agent run yet. Run the agent to draft a reply.
          </p>
        )}

        {!showLive &&
          trace.steps.map((s, i) => {
            const terminal = i === trace.steps.length - 1 && s.kind === "tool";
            if (s.kind === "compaction") {
              return (
                <div key={s.index} className="relative pb-3.5 pl-8">
                  <span className="absolute left-[5px] top-1.5 h-2.5 w-2.5 rounded-xs bg-accent" />
                  <div className="rounded-md bg-inset px-2.5 py-2">
                    <div className="text-xs font-medium text-accent-ink">Context compacted</div>
                    <div className="mt-0.5 font-mono text-2xs text-muted">{s.detail}</div>
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
                  className="absolute left-0.5 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full font-mono text-2xs font-medium"
                  style={
                    terminal
                      ? { background: "var(--ink)", color: "var(--bg)" }
                      : { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }
                  }
                >
                  {terminal ? <IconCheck size={10} /> : s.index}
                </span>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-ink">{s.name}</span>
                </div>
                {s.detail && (
                  <div className="mt-0.5 truncate font-mono text-2xs text-muted">{s.detail}</div>
                )}
              </div>
            );
          })}

        {showLive &&
          events.map(({ id, event }) => <LiveRow key={id} event={event} />)}
        {running && events.length === 0 && <p className="py-2 text-xs text-muted">Starting run…</p>}
        {error && (
          <p className="flex items-center gap-1 py-2 text-xs text-[color:var(--escal-fg)]">
            <IconWarning size={12} /> {error}
          </p>
        )}
      </div>

      {/* Footer */}
      {/* On phones a bar fixed to the bottom of the screen, so Run is in reach from
          anywhere on the ticket (the panel reserves its height with pb-[68px]). */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex flex-none items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 lg:static lg:z-auto">
        <button
          type="button"
          data-tour="run-agent"
          onClick={run}
          disabled={running || (!!quota && (quota.runsLeft === 0 || quota.resting !== null))}
          className={`${buttonClass()} h-10 px-4 text-sm lg:h-8 lg:px-3`}
        >
          {running ? "Running…" : trace.hasRun ? "Re-run agent" : "Run agent"}
        </button>
        {quota && !summary && (
          <span className="text-right text-xs leading-snug text-muted">
            {quota.resting
              ? `Demo budget used. Back ${quota.resting === "day" ? "at 00:00 UTC" : "next month"}`
              : `Live Claude run, ${quota.runsLeft}/${quota.runsLimit} left in 24h`}
          </span>
        )}
        {summary && (
          <span className="font-mono text-2xs text-muted">
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
      return <p className="pb-2 text-xs leading-relaxed text-ink-2">{event.text}</p>;
    case "tool_use":
      return (
        <div className="pb-1.5 font-mono text-xs [overflow-wrap:anywhere]">
          <span className="font-semibold text-accent-ink">{event.name}</span>
          <span className="text-muted">({trunc(JSON.stringify(event.input), 60)})</span>
        </div>
      );
    case "tool_result":
      return (
        <div className="pb-2 font-mono text-2xs text-muted [overflow-wrap:anywhere]">↳ {trunc(JSON.stringify(event.result), 90)}</div>
      );
    case "llm_call":
      return (
        <div className="pb-2 font-mono text-2xs text-muted">
          {event.model} · ${event.costUsd.toFixed(6)}
        </div>
      );
    case "compaction":
      return (
        <div className="pb-2 font-mono text-2xs" style={{ color: "var(--accent-ink)" }}>
          context compacted: {event.tokensBefore}→{event.tokensAfter} (saved {event.tokensSaved})
        </div>
      );
    default:
      return null;
  }
}
