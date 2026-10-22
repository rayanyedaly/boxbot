// evals/report.ts
//
// Turns graded runs into the numbers the README reports: pass rate, cost per ticket,
// and latency — plus per-category and per-case breakdowns and every failure's reason.
//
//   pass@1 — share of scored runs that passed (the expected single-shot success rate),
//            with a Wilson 95% interval: at ~30 cases one case moves it ~3pp, so a
//            difference smaller than the interval is noise, not a regression
//   pass^k — share of cases that passed on ALL k trials (reliability; only when k > 1)
//
// "Scored" excludes ungraded runs — transient infra failures (rate limits, overload)
// and judge failures — which say nothing about the agent. They're counted separately.

import type { Category, GoldCase } from "./cases";
import type { CheckResult, RunRecord } from "./grade";
import type { JudgeResult } from "./judge";

export interface GradedRun extends RunRecord {
  category: Category;
  checks: CheckResult[];
  judge: JudgeResult | null;
  passed: boolean;
}

export interface EvalSummary {
  label: string;
  /** dev (iterated against) or holdout (frozen; milestones only). */
  split: "dev" | "holdout";
  model: string;
  effort: string;
  judgeModel: string;
  gitSha: string | null;
  startedAt: string;
  finishedAt: string;
  trials: number;
  cases: number;
  runs: number;
  /** True if the budget cap stopped the run early — the numbers are partial. */
  incomplete: boolean;
  /** Runs that count toward pass@1 (runs minus ungraded). */
  scored: number;
  passed: number;
  passAt1: number;
  /** Wilson 95% interval for passAt1. */
  passAt1Ci: [number, number];
  /** Null for 1 trial, or when the run is incomplete (cases have unequal trial counts). */
  passAllTrials: number | null;
  /** Runs excluded from scoring: transient infra errors + judge failures. */
  ungraded: { caseKey: string; trial: number; reason: string }[];
  costPerTicketUsd: number;
  agentCostUsd: number;
  judgeCostUsd: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyMaxMs: number;
  toolCallsPerTicket: number;
  /** Runs in which context compaction fired at least once. */
  runsWithCompaction: number;
  byCategory: Record<string, { runs: number; passed: number }>;
  byCase: Record<string, { category: Category; trials: number; passed: number; meanCostUsd: number; meanLatencyMs: number }>;
  failures: { caseKey: string; trial: number; reasons: string[] }[];
}

export interface EvalResults {
  summary: EvalSummary;
  runs: GradedRun[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Nearest-rank percentile. */
export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

/** Wilson score interval (95%) for k successes out of n. */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Why a run can't be scored, or null if it can. */
export function ungradedReason(r: Pick<GradedRun, "infraError" | "error" | "judge" | "checks">): string | null {
  if (r.infraError) return `infra: ${r.error}`;
  // A judge failure only leaves the verdict open if the hard checks all passed — a run
  // that already failed one is a definite failure, whatever the judge would have said.
  if (r.judge?.error && r.checks.every((c) => c.pass)) return `judge: ${r.judge.error}`;
  return null;
}

/** Why a run failed, one line per failed hard check / judge criterion. */
export function failureReasons(r: GradedRun): string[] {
  const reasons = r.checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail ?? "failed"}`);
  for (const v of r.judge?.criteria ?? []) {
    if (!v.pass) reasons.push(`judge: "${v.criterion}" — ${v.reason}`);
  }
  return reasons;
}

export function summarize(
  meta: Pick<EvalSummary, "label" | "split" | "model" | "effort" | "judgeModel" | "gitSha" | "startedAt" | "trials" | "incomplete">,
  cases: GoldCase[],
  runs: GradedRun[],
): EvalSummary {
  const scoredRuns = runs.filter((r) => ungradedReason(r) === null);
  const byCategory: EvalSummary["byCategory"] = {};
  const byCase: EvalSummary["byCase"] = {};
  for (const c of cases) {
    const rs = scoredRuns.filter((r) => r.caseKey === c.key);
    if (!rs.length) continue;
    byCase[c.key] = {
      category: c.category,
      trials: rs.length,
      passed: rs.filter((r) => r.passed).length,
      meanCostUsd: mean(rs.map((r) => r.costUsd)),
      meanLatencyMs: mean(rs.map((r) => r.totalLatencyMs)),
    };
    const cat = (byCategory[c.category] ??= { runs: 0, passed: 0 });
    cat.runs += rs.length;
    cat.passed += rs.filter((r) => r.passed).length;
  }

  // pass^k needs every case to have all k scored trials; a case cut short (budget cap,
  // infra error) can't claim "passed every trial", so it's left out of the denominator.
  const fullCases = Object.values(byCase).filter((s) => s.trials === meta.trials);
  const passed = scoredRuns.filter((r) => r.passed).length;
  const latencies = scoredRuns.map((r) => r.totalLatencyMs);

  return {
    ...meta,
    finishedAt: new Date().toISOString(),
    cases: Object.keys(byCase).length,
    runs: runs.length,
    scored: scoredRuns.length,
    passed,
    passAt1: scoredRuns.length ? passed / scoredRuns.length : 0,
    passAt1Ci: wilson(passed, scoredRuns.length),
    passAllTrials:
      meta.trials > 1 && !meta.incomplete && fullCases.length
        ? fullCases.filter((s) => s.passed === s.trials).length / fullCases.length
        : null,
    ungraded: runs
      .filter((r) => ungradedReason(r) !== null)
      .map((r) => ({ caseKey: r.caseKey, trial: r.trial, reason: ungradedReason(r)! })),
    // Cost per ticket is what one handled ticket costs; total spend also includes runs
    // that weren't scored and attempts discarded after an infra error.
    costPerTicketUsd: mean(runs.map((r) => r.costUsd)),
    agentCostUsd: runs.reduce((a, r) => a + r.costUsd + r.retriedCostUsd, 0),
    judgeCostUsd: runs.reduce((a, r) => a + (r.judge?.costUsd ?? 0), 0),
    latencyP50Ms: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
    latencyMaxMs: latencies.length ? Math.max(...latencies) : 0,
    toolCallsPerTicket: mean(scoredRuns.map((r) => r.tools.length)),
    runsWithCompaction: runs.filter((r) => r.compactions > 0).length,
    byCategory,
    byCase,
    failures: scoredRuns
      .filter((r) => !r.passed)
      .map((r) => ({ caseKey: r.caseKey, trial: r.trial, reasons: failureReasons(r) })),
  };
}

// ── Markdown ────────────────────────────────────────────────────────────────

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `$${x.toFixed(4)}`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** The compact headline table — used in the README block and at the top of the report. */
export function headlineMarkdown(s: EvalSummary): string {
  const rows = [
    [
      "Pass rate (pass@1)",
      `**${pct(s.passAt1)}** (${s.passed}/${s.scored} runs; 95% CI ${pct(s.passAt1Ci[0])}–${pct(s.passAt1Ci[1])})`,
    ],
    ...(s.passAllTrials !== null ? [[`Reliability (pass^${s.trials})`, pct(s.passAllTrials)]] : []),
    ["Cost per ticket", usd(s.costPerTicketUsd)],
    ["Latency p50 / p95 / max", `${secs(s.latencyP50Ms)} / ${secs(s.latencyP95Ms)} / ${secs(s.latencyMaxMs)}`],
    ["Tool calls per ticket", s.toolCallsPerTicket.toFixed(1)],
    ...(s.ungraded.length ? [["Ungraded (infra / judge errors)", String(s.ungraded.length)]] : []),
  ];
  const lines = [
    `| Metric | Value |`,
    `|---|---|`,
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    "",
    `${s.split} split · ${s.cases} cases × ${s.trials} trial(s) · agent \`${s.model}\` (effort ${s.effort}) · judge \`${s.judgeModel}\`` +
      ` · ${s.finishedAt.slice(0, 10)}${s.gitSha ? ` · \`${s.gitSha.slice(0, 7)}\`` : ""}` +
      (s.incomplete ? " · **INCOMPLETE (budget cap hit)**" : ""),
  ];
  return lines.join("\n");
}

export function categoryMarkdown(s: EvalSummary): string {
  return [
    "| Category | Passed |",
    "|---|---|",
    ...Object.entries(s.byCategory).map(([cat, v]) => `| ${cat} | ${v.passed}/${v.runs} |`),
  ].join("\n");
}

export function reportMarkdown(s: EvalSummary): string {
  const caseRows = Object.entries(s.byCase).map(
    ([key, v]) =>
      `| ${v.passed === v.trials ? "✅" : v.passed === 0 ? "❌" : "⚠️"} \`${key}\` | ${v.category} | ${v.passed}/${v.trials} | ${usd(v.meanCostUsd)} | ${secs(v.meanLatencyMs)} |`,
  );
  const failures = s.failures.length
    ? s.failures.flatMap((f) => [`- **${f.caseKey}** (trial ${f.trial})`, ...f.reasons.map((r) => `  - ${r}`)])
    : ["None."];
  const ungraded = s.ungraded.length
    ? ["", "## Ungraded runs", "", ...s.ungraded.map((u) => `- **${u.caseKey}** (trial ${u.trial}) — ${u.reason}`)]
    : [];

  return [
    `# Eval results — ${s.label}`,
    "",
    headlineMarkdown(s),
    "",
    `Agent spend ${usd(s.agentCostUsd)} · judge spend ${usd(s.judgeCostUsd)} · ` +
      `compaction fired in ${s.runsWithCompaction}/${s.runs} runs · ` +
      "latency includes tool execution; runs are sequential with a warm prompt cache",
    "",
    "## By category",
    "",
    categoryMarkdown(s),
    "",
    "## By case",
    "",
    "| Case | Category | Passed | Mean cost | Mean latency |",
    "|---|---|---|---|---|",
    ...caseRows,
    "",
    "## Failures",
    "",
    ...failures,
    ...ungraded,
    "",
  ].join("\n");
}

export const README_START = "<!-- EVALS:START -->";
export const README_END = "<!-- EVALS:END -->";

/** Replace the marked block in the README with the latest headline numbers. */
export function updateReadmeBlock(readme: string, s: EvalSummary, resultsPath: string): string {
  const start = readme.indexOf(README_START);
  const end = readme.indexOf(README_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README is missing the ${README_START} … ${README_END} markers`);
  }
  const block = [
    README_START,
    "",
    headlineMarkdown(s),
    "",
    "<details><summary>By category</summary>",
    "",
    categoryMarkdown(s),
    "",
    "</details>",
    "",
    `Full report: [\`${resultsPath}\`](${resultsPath})`,
    "",
    README_END,
  ].join("\n");
  return readme.slice(0, start) + block + readme.slice(end + README_END.length);
}
