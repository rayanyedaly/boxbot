// app/_components/AgentPanel.tsx
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AgentEvent } from "@/lib/agent/loop";
import { AgentEventRow } from "./AgentEventRow";

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
type Entry = { id: number; event: AgentEvent };

export function AgentPanel({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<DoneSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(0);

  function handle(msg: StreamMsg) {
    if (msg.type === "done") return setSummary(msg);
    if (msg.type === "error") return setError(msg.message);
    // Streaming AgentEvent — merge consecutive text deltas into one growing entry
    // (keeping its stable id so React reconciles in place).
    setEntries((prev) => {
      if (msg.type === "text") {
        const last = prev[prev.length - 1];
        if (last && last.event.type === "text") {
          const merged = prev.slice();
          merged[merged.length - 1] = {
            id: last.id,
            event: { type: "text", text: last.event.text + msg.text },
          };
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
      // Skip one unparseable line rather than failing an otherwise-successful run.
    }
  }

  async function run() {
    if (running) return;
    if (!window.confirm("Run the agent on this ticket? This makes billed API calls.")) {
      return;
    }
    setRunning(true);
    setEntries([]);
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
      // Re-render the server components: the new DRAFT + updated cost readout appear.
      router.refresh();
    }
  }

  const hasOutput = entries.length > 0 || summary || error || running;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">Agent</h2>
          <p className="text-xs text-neutral-500">
            Runs the hand-rolled tool-use loop and stages a draft for your approval.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? (
            <>
              <span
                className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden
              />
              Running…
            </>
          ) : (
            <>▶ Run agent</>
          )}
        </button>
      </div>

      {hasOutput && (
        <div
          role="status"
          aria-live="polite"
          aria-busy={running}
          className="mt-4 max-h-96 space-y-2 overflow-y-auto rounded-lg bg-neutral-50 p-4"
        >
          {entries.map((e) => (
            <AgentEventRow key={e.id} event={e.event} />
          ))}
          {running && entries.length === 0 && (
            <p className="text-xs text-neutral-400">Starting run…</p>
          )}
          {error && <p className="font-mono text-xs text-rose-600">⚠ {error}</p>}
          {summary && (
            <div className="mt-2 border-t border-neutral-200 pt-2 text-xs text-neutral-600">
              <span className="font-semibold text-neutral-900">
                {summary.toolCalls.length} tools
              </span>{" "}
              · {summary.llmCalls} calls ·{" "}
              <span className="font-semibold text-emerald-700">
                ${summary.totalCostUsd.toFixed(6)}
              </span>
              {summary.compactions > 0 &&
                ` · ${summary.compactions} compaction(s), saved ${summary.tokensSaved} tokens`}
              {" · "}
              {summary.stopReason}
              {summary.hitIterationCap && " (hit iteration cap)"}
              <div className="mt-1 text-neutral-400">
                {summary.toolCalls.join(" → ")}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
