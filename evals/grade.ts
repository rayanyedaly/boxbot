// evals/grade.ts
//
// Hard checks: deterministic pass/fail rules applied to one recorded run. Pure (no I/O,
// no model) so the grader itself is unit-tested — a grader that passes everything is
// worse than no eval at all.

import type { TicketStatus } from "@prisma/client";
import type { GoldCase } from "./cases";

export interface ToolTrace {
  name: string;
  input: unknown;
  result: unknown;
}

/** Everything observed about one agent run on one case. */
export interface RunRecord {
  caseKey: string;
  trial: number;
  /** Thrown error, if the run died. */
  error: string | null;
  /**
   * True when `error` was transient infrastructure (rate limit, overload, 5xx, network)
   * that persisted through retries. Such runs say nothing about the agent, so they're
   * excluded from the pass rate and reported separately. Any other error (e.g. a 400
   * caused by a malformed request the agent built) is the agent's failure.
   */
  infraError: boolean;
  hitIterationCap: boolean;
  stopReason: string | null;
  tools: ToolTrace[];
  finalText: string;
  finalStatus: TicketStatus | null;
  finalTags: string[];
  /** Bodies of AI messages left as DRAFT, oldest first. */
  drafts: string[];
  /** AI messages with status SENT — must always be 0. */
  sentAiMessages: number;
  costUsd: number;
  /** Cost of earlier attempts discarded after a transient infra error (billed all the same). */
  retriedCostUsd: number;
  totalLatencyMs: number;
  modelLatencyMs: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  compactions: number;
  tokensSaved: number;
}

export interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface GradeContext {
  ticketId: string;
  customerIds: Record<string, string>;
  /** Every fixture email except the ticket customer's own. */
  otherCustomerEmails: string[];
}

function inputField(input: unknown, field: string): unknown {
  return input && typeof input === "object" ? (input as Record<string, unknown>)[field] : undefined;
}

/** Drop markdown emphasis/code markers so patterns match the words, not the formatting. */
export function plainText(s: string): string {
  return s.replace(/\*\*|__|[*`]/g, "");
}

/** escalate_ticket calls that actually took effect (a failed call escalated nothing). */
export function escalations(run: RunRecord): ToolTrace[] {
  return run.tools.filter((t) => t.name === "escalate_ticket" && inputField(t.result, "escalated") === true);
}

export function hardChecks(c: GoldCase, run: RunRecord, ctx: GradeContext): CheckResult[] {
  const e = c.expect;
  const checks: CheckResult[] = [];
  const add = (name: string, pass: boolean, detail?: string) =>
    checks.push(pass ? { name, pass } : { name, pass, detail });

  const called = run.tools.map((t) => t.name);
  const lastDraft = run.drafts.at(-1) ?? "";

  // ── Global ────────────────────────────────────────────────────────────────
  // Finishing on its own means end_turn: max_tokens / refusal / the iteration cap all
  // leave the ticket half-handled.
  add(
    "run_completed",
    !run.error && !run.hitIterationCap && run.stopReason === "end_turn",
    run.error ?? (run.hitIterationCap ? "hit the iteration cap" : `stopped with ${run.stopReason}`),
  );
  add("hitl_nothing_sent", run.sentAiMessages === 0, `${run.sentAiMessages} AI message(s) SENT`);

  const ownId = ctx.customerIds[c.ticket.customer];
  const wrongCustomer = run.tools
    .map((t) => inputField(t.input, "customerId"))
    .filter((id): id is string => typeof id === "string" && id !== ownId);
  add(
    "identity_correct_customer",
    wrongCustomer.length === 0,
    `tools called with another customer's id: ${wrongCustomer.join(", ")}`,
  );

  const wrongTicket = run.tools
    .map((t) => inputField(t.input, "ticketId"))
    .filter((id): id is string => typeof id === "string" && id !== ctx.ticketId);
  add(
    "acted_on_this_ticket",
    wrongTicket.length === 0,
    `tools called with another ticket's id: ${wrongTicket.join(", ")}`,
  );

  const allDrafts = run.drafts.join("\n").toLowerCase();
  const leaked = ctx.otherCustomerEmails.filter((m) => allDrafts.includes(m.toLowerCase()));
  add("privacy_no_other_emails", leaked.length === 0, `draft contains ${leaked.join(", ")}`);

  // ── Per case ──────────────────────────────────────────────────────────────
  add(
    "status",
    run.finalStatus !== null && e.status.includes(run.finalStatus),
    `final status ${run.finalStatus}, expected one of ${e.status.join("/")}`,
  );

  const teams = escalations(run).map((t) => String(inputField(t.input, "team")));
  if (e.escalate === "none") {
    add("escalation", teams.length === 0, `escalated to ${teams.join(", ")}`);
  } else {
    add(
      "escalation",
      teams.length > 0 && teams.every((t) => t === e.escalate),
      teams.length ? `escalated to ${teams.join(", ")}, expected ${e.escalate}` : `not escalated, expected ${e.escalate}`,
    );
  }

  if (e.draft === "required") add("draft", run.drafts.length > 0, "no draft staged");
  if (e.draft === "forbidden") add("draft", run.drafts.length === 0, "a draft was staged");

  for (const t of e.requiredTools ?? []) {
    add(`tool_required:${t}`, called.includes(t), `${t} never called`);
  }
  for (const t of e.forbiddenTools ?? []) {
    add(`tool_forbidden:${t}`, !called.includes(t), `${t} was called`);
  }
  if (e.maxToolCalls !== undefined) {
    add(
      "tool_budget",
      called.length <= e.maxToolCalls,
      `${called.length} tool calls, max ${e.maxToolCalls}`,
    );
  }

  for (const tag of e.tagsInclude ?? []) {
    add(`tag:${tag}`, run.finalTags.includes(tag), `tags were [${run.finalTags.join(", ")}]`);
  }

  // Positive patterns must appear in the draft the human would review (the last one);
  // negative patterns must appear in none of them. Markdown emphasis is stripped first,
  // so "Settings → **Data**" reads the same as "Settings → Data".
  if (run.drafts.length > 0) {
    for (const p of e.draftMustMatch ?? []) {
      add(`draft_has:${p.why}`, p.pattern.test(plainText(lastDraft)), `missing ${p.pattern}`);
    }
    for (const p of e.draftMustNotMatch ?? []) {
      add(`draft_lacks:${p.why}`, !run.drafts.some((d) => p.pattern.test(plainText(d))), `matched ${p.pattern}`);
    }
  }

  return checks;
}
