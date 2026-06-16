// app/_components/AgentEventRow.tsx
"use client";

import type { ReactNode } from "react";
import type { AgentEvent } from "@/lib/agent/loop";

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function Row({
  icon,
  color,
  children,
}: {
  icon: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 font-mono text-xs leading-relaxed">
      <span className={`select-none ${color}`} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

/** Render one streamed agent event with a per-type icon and tone. */
export function AgentEventRow({ event }: { event: AgentEvent }) {
  switch (event.type) {
    case "text":
      return (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
          {event.text}
        </p>
      );
    case "tool_use":
      return (
        <Row icon="🔧" color="text-indigo-600">
          <span className="font-semibold text-indigo-700">{event.name}</span>
          <span className="text-neutral-400">
            ({trunc(JSON.stringify(event.input), 90)})
          </span>
        </Row>
      );
    case "tool_result":
      return (
        <Row icon="↳" color="text-neutral-400">
          <span className="text-neutral-500">
            {trunc(JSON.stringify(event.result), 120)}
          </span>
        </Row>
      );
    case "llm_call":
      return (
        <Row icon="·" color="text-emerald-600">
          <span className="text-neutral-500">
            {event.model} · in {event.inputTokens} / out {event.outputTokens} ·{" "}
            <span className="font-semibold text-emerald-700">
              ${event.costUsd.toFixed(6)}
            </span>
          </span>
        </Row>
      );
    case "compaction":
      return (
        <Row icon="🗜" color="text-amber-600">
          <span className="text-amber-700">
            compaction: {event.tokensBefore}→{event.tokensAfter} tokens (saved{" "}
            {event.tokensSaved})
          </span>
        </Row>
      );
    default:
      return null;
  }
}
