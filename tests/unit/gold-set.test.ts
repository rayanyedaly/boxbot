import { describe, it, expect } from "vitest";
import { CASES as DEV_CASES } from "../../evals/cases";
import { HOLDOUT_CASES } from "../../evals/holdout";
import { CUSTOMERS as DEV_CUSTOMERS, KB_ARTICLES } from "../../evals/fixtures/world";
import { HOLDOUT_CUSTOMERS } from "../../evals/fixtures/holdout-world";
import { toolDefinitions } from "../../lib/agent/tools";

// Static integrity of the gold set — free to run (no model, no DB). Catches a case
// that cites a policy that doesn't exist, references a missing customer, or expects
// something its own fields contradict.

// Integrity rules apply to both splits.
const CASES = [...DEV_CASES, ...HOLDOUT_CASES];
const CUSTOMERS: Record<string, unknown> = { ...DEV_CUSTOMERS, ...HOLDOUT_CUSTOMERS };
const kbSlugs = new Set(KB_ARTICLES.map((a) => a.slug));

describe("held-out split", () => {
  it("is disjoint from the dev set: own case keys, own customers", () => {
    const devKeys = new Set(DEV_CASES.map((c) => c.key));
    expect(HOLDOUT_CASES.filter((c) => devKeys.has(c.key))).toEqual([]);
    expect(Object.keys(HOLDOUT_CUSTOMERS).filter((k) => k in DEV_CUSTOMERS)).toEqual([]);
    const devEmails = new Set(Object.values(DEV_CUSTOMERS).map((c) => c.email));
    expect(Object.values(HOLDOUT_CUSTOMERS).filter((c) => devEmails.has(c.email))).toEqual([]);
    // Held-out tickets are filed by held-out customers (dev customers may appear as
    // third parties, e.g. the colleague asked about, but never as the sender).
    for (const c of HOLDOUT_CASES) expect(c.ticket.customer in HOLDOUT_CUSTOMERS, c.key).toBe(true);
    // Dev runs load only the dev world — a dev case naming a held-out customer would
    // typecheck, then crash mid-run after spending.
    for (const c of DEV_CASES) expect(c.ticket.customer in DEV_CUSTOMERS, c.key).toBe(true);
  });
});
const toolNames = new Set(toolDefinitions.map((t) => t.name));

describe("gold set integrity", () => {
  it("has unique, stable keys", () => {
    const keys = CASES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9-]+$/);
  });

  it("derives every expected outcome from a policy that exists", () => {
    for (const c of CASES) {
      expect(c.policy.length, c.key).toBeGreaterThan(0);
      for (const p of c.policy) {
        expect(p === "system-prompt" || kbSlugs.has(p), `${c.key} cites unknown policy "${p}"`).toBe(true);
      }
    }
  });

  it("references real customers and real tools", () => {
    for (const c of CASES) {
      expect(CUSTOMERS[c.ticket.customer], c.key).toBeDefined();
      for (const t of [...(c.expect.requiredTools ?? []), ...(c.expect.forbiddenTools ?? [])]) {
        expect(toolNames.has(t), `${c.key} names unknown tool "${t}"`).toBe(true);
      }
    }
  });

  it("keeps escalation, status and tools mutually consistent", () => {
    const teams = (toolDefinitions.find((t) => t.name === "escalate_ticket")!.input_schema.properties as Record<
      string,
      { enum?: string[] }
    >).team.enum!;
    for (const c of CASES) {
      const { escalate, status, requiredTools = [], forbiddenTools = [], maxToolCalls } = c.expect;
      if (escalate === "none") expect(status, c.key).not.toContain("ESCALATED");
      else {
        expect(status, c.key).toEqual(["ESCALATED"]);
        expect(teams, c.key).toContain(escalate);
      }
      expect(requiredTools.filter((t) => forbiddenTools.includes(t)), c.key).toEqual([]);
      if (maxToolCalls !== undefined) expect(maxToolCalls, c.key).toBeGreaterThanOrEqual(requiredTools.length + 1);
      if (c.expect.draft === "forbidden") expect(c.expect.draftMustMatch ?? [], c.key).toEqual([]);
    }
  });

  it("has well-formed rubrics and patterns", () => {
    for (const c of CASES) {
      expect(c.intent.trim(), c.key).not.toBe("");
      expect(c.expect.rubric.length, c.key).toBeGreaterThan(0);
      for (const r of c.expect.rubric) expect(r.trim(), c.key).not.toBe("");
      const patterns = [...(c.expect.draftMustMatch ?? []), ...(c.expect.draftMustNotMatch ?? [])];
      // Check names are built from `why`, so duplicates would hide a failure.
      expect(new Set(patterns.map((p) => p.why)).size, c.key).toBe(patterns.length);
      for (const p of patterns) {
        // /g or /y regexes keep lastIndex between .test() calls — results would flip.
        expect(p.pattern.global || p.pattern.sticky, `${c.key}: ${p.pattern}`).toBe(false);
        expect(p.why.trim(), c.key).not.toBe("");
      }
    }
  });
});
