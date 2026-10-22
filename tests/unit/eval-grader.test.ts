import { describe, it, expect } from "vitest";
import { CASES, type GoldCase } from "../../evals/cases";
import { hardChecks, type RunRecord, type GradeContext } from "../../evals/grade";
import {
  failureReasons,
  percentile,
  summarize,
  updateReadmeBlock,
  wilson,
  type GradedRun,
} from "../../evals/report";
import { assertEvalDatabase, evalDatabaseUrl } from "../../evals/fixtures/load";
import Anthropic from "@anthropic-ai/sdk";
import { CUSTOMERS, daysAgo, type CustomerKey } from "../../evals/fixtures/world";
import { isTransientApiError } from "../../evals/retry";

// The grader decides what "passing" means, so it gets the same scrutiny as the agent:
// a correct run must pass, and each kind of wrong run must fail for the right reason.

const byKey = (k: string): GoldCase => {
  const c = CASES.find((x) => x.key === k);
  if (!c) throw new Error(`no case ${k}`);
  return c;
};

const customerIds = Object.fromEntries(
  Object.keys(CUSTOMERS).map((k) => [k, `cust_${k}`]),
) as Record<CustomerKey, string>;

function ctxFor(c: GoldCase): GradeContext {
  return {
    ticketId: "tkt_1",
    customerIds,
    otherCustomerEmails: Object.values(CUSTOMERS)
      .map((x) => x.email)
      .filter((m) => m !== (CUSTOMERS as Record<string, { email: string }>)[c.ticket.customer].email),
  };
}

function run(over: Partial<RunRecord> = {}): RunRecord {
  return {
    caseKey: "x",
    trial: 1,
    error: null,
    infraError: false,
    hitIterationCap: false,
    stopReason: "end_turn",
    tools: [],
    finalText: "",
    finalStatus: "OPEN",
    finalTags: [],
    drafts: [],
    sentAiMessages: 0,
    costUsd: 0.01,
    retriedCostUsd: 0,
    totalLatencyMs: 1000,
    modelLatencyMs: 800,
    llmCalls: 2,
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    compactions: 0,
    tokensSaved: 0,
    ...over,
  };
}

const tool = (name: string, input: Record<string, unknown>, result: unknown = {}) => ({ name, input, result });
const escalate = (team: string) =>
  tool("escalate_ticket", { ticketId: "tkt_1", team, reason: "r" }, { escalated: true, team });
const failed = (c: GoldCase, r: RunRecord) =>
  hardChecks(c, r, ctxFor(c)).filter((x) => !x.pass).map((x) => x.name);

describe("hardChecks — global checks", () => {
  const cancel = byKey("how-to-cancel");
  const good = run({
    tools: [
      tool("search_customer", { query: "tom.becker@example.com" }),
      tool("search_knowledge_base", { query: "cancel" }),
      tool("draft_reply", { ticketId: "tkt_1", body: "..." }),
    ],
    drafts: ["Hi Tom — go to Settings → Billing → Manage plan and click Cancel subscription."],
  });

  it("passes a correct run", () => {
    expect(failed(cancel, good)).toEqual([]);
  });

  it("requires the run to end with end_turn", () => {
    expect(failed(cancel, { ...good, error: "boom" })).toEqual(["run_completed"]);
    expect(failed(cancel, { ...good, hitIterationCap: true })).toEqual(["run_completed"]);
    expect(failed(cancel, { ...good, stopReason: "max_tokens" })).toEqual(["run_completed"]);
    expect(failed(cancel, { ...good, stopReason: "refusal" })).toEqual(["run_completed"]);
  });

  it("fails if anything was SENT", () => {
    expect(failed(cancel, { ...good, sentAiMessages: 1 })).toEqual(["hitl_nothing_sent"]);
  });

  it("fails a run that touched another customer or another ticket", () => {
    const r = {
      ...good,
      tools: [
        ...good.tools,
        tool("get_customer_context", { customerId: "cust_maya" }),
        tool("update_ticket", { ticketId: "tkt_other", status: "RESOLVED" }),
      ],
    };
    expect(failed(cancel, r)).toEqual(["identity_correct_customer", "acted_on_this_ticket"]);
    // The ticket's own customer is fine.
    const own = { ...good, tools: [...good.tools, tool("get_customer_context", { customerId: "cust_tom" })] };
    expect(failed(cancel, own)).toEqual([]);
  });

  it("catches another customer's email in ANY draft, case-insensitively", () => {
    expect(failed(cancel, { ...good, drafts: ["MAYA.CHEN@EXAMPLE.COM", good.drafts[0]] })).toEqual([
      "privacy_no_other_emails",
    ]);
    expect(failed(cancel, { ...good, drafts: [`${good.drafts[0]} (tom.becker@example.com)`] })).toEqual([]);
  });
});

describe("hardChecks — per-case expectations", () => {
  const cancel = byKey("how-to-cancel");
  const good = run({
    tools: [
      tool("search_customer", { query: "tom.becker@example.com" }),
      tool("search_knowledge_base", { query: "cancel" }),
      tool("draft_reply", { ticketId: "tkt_1", body: "..." }),
    ],
    drafts: ["Hi Tom — go to Settings → Billing → Manage plan and click Cancel subscription."],
  });

  it("enforces required tools, forbidden tools and the tool budget", () => {
    expect(failed(cancel, { ...good, tools: good.tools.filter((t) => t.name !== "search_knowledge_base") })).toEqual([
      "tool_required:search_knowledge_base",
    ]);
    expect(failed(cancel, { ...good, tools: [...good.tools, tool("search_orders", { customerId: "cust_tom" })] })).toEqual([
      "tool_forbidden:search_orders",
    ]);
    const kb = tool("search_knowledge_base", { query: "billing" });
    expect(failed(cancel, { ...good, tools: [...good.tools, kb, kb, kb] })).toEqual([]); // 6 = budget
    expect(failed(cancel, { ...good, tools: [...good.tools, kb, kb, kb, kb] })).toEqual(["tool_budget"]); // 7
  });

  it("checks must-match on the LAST draft only", () => {
    expect(failed(cancel, { ...good, drafts: [good.drafts[0], "Sorry, can't help with that."] })).toEqual([
      "draft_has:gives the cancel path",
    ]);
    expect(failed(cancel, { ...good, drafts: ["Sorry, can't help with that.", good.drafts[0]] })).toEqual([]);
  });

  it("checks must-not-match on EVERY draft", () => {
    const sam = byKey("same-name-customers");
    const ok = run({
      tools: [tool("search_customer", { query: "sam.lee@example.com" })],
      drafts: ["Hi Sam — there are no charges on your Free account."],
    });
    const leak = "draft_lacks:quoted the OTHER Sam Lee's $240 annual charge";
    expect(failed(sam, ok)).toEqual([]);
    expect(failed(sam, { ...ok, drafts: ["Your last charge was $240.00."] })).toEqual([leak]);
    expect(failed(sam, { ...ok, drafts: ["It was $240.", ok.drafts[0]] })).toEqual([leak]);
  });

  it("checks the final status against the allowed set", () => {
    const phantom = byKey("phantom-charge"); // OPEN or PENDING
    const r = run({ tools: [tool("search_orders", { customerId: "cust_sophie" })], drafts: ["Hi Sophie"] });
    expect(failed(phantom, { ...r, finalStatus: "PENDING" })).toEqual([]);
    expect(failed(phantom, { ...r, finalStatus: "RESOLVED" })).toEqual(["status"]);
    const missing = hardChecks(phantom, { ...r, finalStatus: null }, ctxFor(phantom)).find((c) => c.name === "status");
    expect(missing).toMatchObject({ pass: false, detail: expect.stringContaining("null") });
  });

  it("requires exactly the expected escalation team", () => {
    const dispute = byKey("chargeback-threat");
    const esc = (tools: RunRecord["tools"]) => run({ finalStatus: "ESCALATED", tools });
    expect(failed(dispute, esc([escalate("trust_and_safety")]))).toEqual([]);
    expect(failed(dispute, esc([escalate("billing")]))).toEqual(["escalation"]);
    expect(failed(dispute, esc([escalate("trust_and_safety"), escalate("billing")]))).toEqual(["escalation"]);
    expect(failed(dispute, run({ finalStatus: "OPEN" }))).toEqual(["status", "escalation"]);
  });

  it("ignores an escalate_ticket call that failed", () => {
    const dispute = byKey("chargeback-threat");
    const broken = tool("escalate_ticket", { ticketId: "tkt_1", team: "trust_and_safety" }, { error: "tool_failed" });
    expect(failed(dispute, run({ finalStatus: "OPEN", tools: [broken] }))).toEqual(["status", "escalation"]);
  });

  it("fails escalating a ticket that must not be escalated", () => {
    const r = { ...good, finalStatus: "ESCALATED" as const, tools: [...good.tools, escalate("success")] };
    expect(failed(cancel, r)).toEqual(["status", "escalation"]);
  });

  it("enforces required drafts, forbidden drafts and required tags", () => {
    const fr = byKey("feature-request");
    expect(failed(fr, run({ finalStatus: "RESOLVED" }))).toEqual(["draft", "tag:feature-request"]);

    const forbidding: GoldCase = { ...cancel, expect: { ...cancel.expect, draft: "forbidden", draftMustMatch: [] } };
    expect(failed(forbidding, good)).toEqual(["draft"]);
    expect(failed(forbidding, { ...good, drafts: [] })).toEqual([]);
  });
});

describe("draft patterns", () => {
  // Each shared pattern against phrasings a correct draft might use, and near-misses.
  const pattern = (key: string, why: string) => {
    const p = [...(byKey(key).expect.draftMustMatch ?? []), ...(byKey(key).expect.draftMustNotMatch ?? [])].find(
      (x) => x.why === why,
    );
    if (!p) throw new Error(`no pattern "${why}" on ${key}`);
    return p.pattern;
  };

  it("REFUND_TIMELINE accepts the common phrasings", () => {
    const re = pattern("refund-already-issued", "states the 5–10 business day refund timeline");
    for (const s of ["5–10 business days", "5-10 business days", "5 to 10 business days", "between 5 and 10 business days", "five to ten working days"]) {
      expect(re.test(s), s).toBe(true);
    }
    expect(re.test("10 business days")).toBe(false);
  });

  it("dollar amounts don't match longer numbers", () => {
    const usd240 = pattern("refund-already-issued", "references the $240 refund");
    for (const s of ["$240", "$240.00", "$ 240", "the $240, so", "$240."]) expect(usd240.test(s), s).toBe(true);
    for (const s of ["$2400", "$2,400", "1240", "240"]) expect(usd240.test(s), s).toBe(false);
    const usd20 = pattern("upgrade-pricing", "states the $20/month price");
    expect(usd20.test("$20/month")).toBe(true);
    expect(usd20.test("Pro costs $20, or $240 a year")).toBe(true);
    expect(usd20.test("$200")).toBe(false);
    expect(usd20.test("$20,000")).toBe(false);
  });

  it("2FA, password reset and export paths accept common variants", () => {
    const tfa = pattern("account-takeover", "advises enabling two-factor authentication");
    for (const s of ["two-factor", "two factor", "2FA", "two-step verification", "MFA", "multi-factor"]) {
      expect(tfa.test(s), s).toBe(true);
    }
    const reset = pattern("first-login-issue", "points to the password reset");
    for (const s of ["click Forgot password", "Forgot your password?", "reset your password", "try resetting your password", "reset the password"]) {
      expect(reset.test(s), s).toBe(true);
    }
    const exp = pattern("how-to-export", "gives the export path");
    expect(exp.test("Settings → Data → Export")).toBe(true);
    expect(exp.test("Settings > Data")).toBe(true);
    expect(exp.test("Yes, you can export your data!")).toBe(false); // echoing the question isn't an answer
  });

  it("matches through markdown emphasis in the draft", () => {
    const exp = byKey("how-to-export");
    const r = run({
      tools: [tool("search_knowledge_base", { query: "export" })],
      drafts: ["Hi Aisha — go to **Settings** → **Data** → **Export**."],
    });
    expect(failed(exp, r)).toEqual([]);
  });
});

describe("summarize", () => {
  const graded = (caseKey: string, trial: number, passed: boolean, over: Partial<GradedRun> = {}): GradedRun => ({
    ...run({ caseKey, trial, costUsd: 0.02 }),
    category: "how-to",
    checks: [],
    judge: null,
    passed,
    ...over,
  });
  const meta = {
    label: "t",
    split: "dev" as const,
    model: "m",
    effort: "medium",
    judgeModel: "j",
    gitSha: null,
    startedAt: "2026-01-01T00:00:00Z",
    trials: 2,
    incomplete: false,
  };
  const twoCases = [byKey("how-to-cancel"), byKey("how-to-export")];

  it("computes pass@1 over runs and pass^k over cases", () => {
    const s = summarize(meta, twoCases, [
      graded("how-to-cancel", 1, true),
      graded("how-to-cancel", 2, true),
      graded("how-to-export", 1, true),
      graded("how-to-export", 2, false),
    ]);
    expect(s.passAt1).toBe(0.75);
    expect(s.passAllTrials).toBe(0.5);
    expect(s.costPerTicketUsd).toBeCloseTo(0.02);
    expect(s.byCategory["how-to"]).toEqual({ runs: 4, passed: 3 });
    expect(s.failures).toEqual([{ caseKey: "how-to-export", trial: 2, reasons: [] }]);
  });

  it("doesn't claim pass^k for an incomplete run or a single trial", () => {
    const partial = [graded("how-to-cancel", 1, true), graded("how-to-cancel", 2, true), graded("how-to-export", 1, true)];
    expect(summarize({ ...meta, incomplete: true }, twoCases, partial).passAllTrials).toBeNull();
    expect(summarize({ ...meta, trials: 1 }, twoCases, [graded("how-to-cancel", 1, true)]).passAllTrials).toBeNull();
  });

  it("excludes infra and judge failures from the pass rate and lists them", () => {
    const judgeDown = { model: "j", pass: false, criteria: [], costUsd: 0, error: "judge call failed" };
    const s = summarize({ ...meta, trials: 1 }, twoCases, [
      graded("how-to-cancel", 1, true),
      graded("how-to-export", 1, false, { error: "overloaded", infraError: true }),
      graded("how-to-export", 1, false, { judge: judgeDown }),
    ]);
    expect(s.scored).toBe(1);
    expect(s.passAt1).toBe(1);
    expect(s.failures).toEqual([]);
    expect(s.ungraded.map((u) => u.reason)).toEqual(["infra: overloaded", "judge: judge call failed"]);
    // A judge failure can't rescue a run that already failed a hard check.
    const failedCheck = summarize({ ...meta, trials: 1 }, twoCases, [
      graded("how-to-cancel", 1, false, { checks: [{ name: "escalation", pass: false }], judge: judgeDown }),
    ]);
    expect(failedCheck.scored).toBe(1);
    expect(failedCheck.ungraded).toEqual([]);
    // ...and a non-transient agent error (e.g. a 400 it caused) is a real failure.
    const agentBug = summarize({ ...meta, trials: 1 }, twoCases, [graded("how-to-cancel", 1, false, { error: "400 bad request" })]);
    expect(agentBug.scored).toBe(1);
    expect(agentBug.passAt1).toBe(0);
  });

  it("lists failure reasons: failed checks, then failed judge criteria", () => {
    const g = graded("how-to-cancel", 1, false, {
      checks: [{ name: "status", pass: false, detail: "x" }, { name: "draft", pass: true }],
      judge: { model: "j", pass: false, costUsd: 0, error: null, criteria: [{ criterion: "C", pass: false, reason: "R" }] },
    });
    expect(failureReasons(g)).toEqual(["status: x", 'judge: "C" — R']);
  });

  it("only replaces the marked README block", () => {
    const s = summarize({ ...meta, trials: 1 }, twoCases, [graded("how-to-cancel", 1, true)]);
    const readme = "intro\n<!-- EVALS:START -->\nold\n<!-- EVALS:END -->\noutro";
    const out = updateReadmeBlock(readme, s, "evals/results/latest.md");
    expect(out.startsWith("intro\n<!-- EVALS:START -->")).toBe(true);
    expect(out.endsWith("<!-- EVALS:END -->\noutro")).toBe(true);
    expect(out).toContain("100.0%");
    expect(out).not.toContain("old");
    expect(() => updateReadmeBlock("no markers", s, "x")).toThrow(/markers/);
  });
});

describe("report math", () => {
  it("percentile is nearest-rank", () => {
    const xs = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(percentile(xs, 50)).toBe(500);
    expect(percentile(xs, 95)).toBe(1000);
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([], 50)).toBe(0);
  });

  it("wilson matches known intervals", () => {
    const [lo, hi] = wilson(24, 28);
    expect(lo).toBeCloseTo(0.685, 2);
    expect(hi).toBeCloseTo(0.943, 2);
    expect(wilson(0, 0)).toEqual([0, 0]);
    expect(wilson(28, 28)[1]).toBe(1);
  });
});

describe("eval database guard", () => {
  it("accepts only a database literally named inbox_eval", () => {
    expect(() => assertEvalDatabase("postgresql://u:p@localhost:5433/inbox_eval?schema=public")).not.toThrow();
    for (const bad of [
      undefined,
      "postgresql://u:p@h/inbox",
      "postgresql://inbox_eval:p@h/inbox",
      "postgresql://u:p@h/inbox?application_name=inbox_eval",
      "postgresql://u:p@h/inbox_evaluation",
      "not a url",
    ]) {
      expect(() => assertEvalDatabase(bad), String(bad)).toThrow(/Refusing/);
    }
  });

  it("derives the eval URL from DATABASE_URL unless EVAL_DATABASE_URL is set", () => {
    expect(evalDatabaseUrl({ DATABASE_URL: "postgresql://u:p@h:5433/inbox?schema=public" })).toBe(
      "postgresql://u:p@h:5433/inbox_eval?schema=public",
    );
    expect(evalDatabaseUrl({ DATABASE_URL: "postgresql://u:p@h/inbox", EVAL_DATABASE_URL: "postgresql://x/inbox_eval" })).toBe(
      "postgresql://x/inbox_eval",
    );
    expect(() => evalDatabaseUrl({})).toThrow();
  });
});

describe("isTransientApiError", () => {
  const headers = new Headers();
  it("retries overload, rate limits, 5xx, network drops — including mid-stream ones", () => {
    expect(isTransientApiError(new Anthropic.APIConnectionError({ message: "down" }))).toBe(true);
    expect(isTransientApiError(new Anthropic.RateLimitError(429, {}, "slow down", headers))).toBe(true);
    expect(isTransientApiError(new Anthropic.InternalServerError(529, {}, "overloaded", headers))).toBe(true);
    // SSE `event: error` inside an open stream: an APIError with no status.
    expect(isTransientApiError(new Anthropic.APIError(undefined, {}, "overloaded", headers, "overloaded_error"))).toBe(true);
    // Socket dropped mid-stream: MessageStream wraps the TypeError.
    const dropped = Object.assign(new Anthropic.AnthropicError("terminated"), { cause: new TypeError("terminated") });
    expect(isTransientApiError(dropped)).toBe(true);
  });

  it("treats request errors the agent caused as real failures", () => {
    expect(isTransientApiError(new Anthropic.BadRequestError(400, {}, "bad", headers))).toBe(false);
    expect(isTransientApiError(new Anthropic.APIError(undefined, {}, "bad", headers, "invalid_request_error"))).toBe(false);
    expect(isTransientApiError(new Anthropic.AnthropicError("No price for model"))).toBe(false);
    expect(isTransientApiError(new Error("ticket_not_found:x"))).toBe(false);
  });
});

describe("fixture dates line up with the ticket text", () => {
  // Ticket bodies quote calendar dates; the fixtures store days-ago. Pin the pairs.
  it.each([
    [33, "2026-08-13"], // grace: "charged $20 on August 13" — just outside 30 days
    [28, "2026-08-18"], // jonas: "charged $20 on August 18" — just inside 30 days
    [4, "2026-09-11"], // hannah: "September 11"
  ])("%i days before EVAL_NOW is %s", (n, iso) => {
    expect(daysAgo(n).toISOString().slice(0, 10)).toBe(iso);
  });
});
