// evals/run.ts
//
// Runs the gold set against the real agent and model, grades every run, and writes
// the report.
//
//   npm run eval                                 # every case, 1 trial
//   npm run eval -- --trials 3                   # pass@1 + pass^3
//   npm run eval -- --filter refund              # cases whose key contains "refund"
//   npm run eval -- --split holdout              # the frozen held-out set (milestones only)
//   npm run eval -- --model claude-sonnet-5-5    # agent model override (judge unchanged)
//   npm run eval -- --max-usd 5                  # stop before spend passes $5
//   npm run eval -- --min-pass-rate 0.85         # exit 1 below this pass@1
//   npm run eval -- --readme                     # also refresh the README results block
//   npm run eval -- --rejudge evals/results/x.json  # re-grade stored transcripts with the
//                                                # current judge (no agent calls); writes a
//                                                # judge-agreement report vs the old verdicts
//
// Exit codes: 0 ok · 1 below the pass-rate gate (or crashed) · 2 stopped by the budget
// cap · 3 too many ungraded runs (infra/judge errors) to trust the numbers.
//
// Cases run one at a time: each resets the shared eval DB (EVAL_DATABASE_URL, or
// DATABASE_URL with the database renamed to inbox_eval) before it starts.

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { config as loadEnv } from "dotenv";

const { values: args } = parseArgs({
  options: {
    trials: { type: "string", default: "1" },
    filter: { type: "string" },
    split: { type: "string", default: "dev" },
    model: { type: "string" },
    "max-usd": { type: "string", default: "10" },
    "min-pass-rate": { type: "string", default: "0" },
    label: { type: "string" },
    readme: { type: "boolean", default: false },
    rejudge: { type: "string" },
  },
});

/** A transient infra error gets this many attempts in total before the run is ungraded. */
const CASE_ATTEMPTS = 2;
/** Above this share of ungraded runs, the numbers aren't trustworthy. */
const MAX_UNGRADED_SHARE = 0.2;
/** Arbitrary, fixed key for the "one eval run at a time" advisory lock. */
const EVAL_LOCK_KEY = 7_142_001;

function numberArg(name: string, value: string | undefined, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`--${name} must be a number in [${min}, ${max}]`);
  return n;
}

async function main() {
  // Env must be settled BEFORE the app modules load: lib/prisma reads DATABASE_URL and
  // lib/agent/llm reads ANTHROPIC_MODEL at import time.
  loadEnv({ quiet: true });
  const { assertEvalDatabase, evalDatabaseUrl, loadWorld } = await import("./fixtures/load");
  const dbUrl = evalDatabaseUrl(process.env);
  assertEvalDatabase(dbUrl);
  process.env.DATABASE_URL = dbUrl;
  if (args.model) process.env.ANTHROPIC_MODEL = args.model;

  const trials = numberArg("trials", args.trials, 1, 10);
  const maxUsd = numberArg("max-usd", args["max-usd"], 0, 1000);
  const minPassRate = numberArg("min-pass-rate", args["min-pass-rate"], 0, 1);
  if (!Number.isInteger(trials)) throw new Error("--trials must be an integer");

  const { prisma } = await import("../lib/prisma");
  const { runTicket } = await import("../lib/agent/loop");
  const { AGENT_MODEL, SUMMARY_MODEL, EFFORT } = await import("../lib/agent/llm");
  const { PRICES } = await import("../lib/agent/cost");
  const { CASES } = await import("./cases");
  const { CUSTOMERS, EVAL_NOW } = await import("./fixtures/world");
  const { HOLDOUT_CASES } = await import("./holdout");
  const { HOLDOUT_CUSTOMERS } = await import("./fixtures/holdout-world");
  const { hardChecks } = await import("./grade");
  const { judgeRun, JUDGE_MODEL } = await import("./judge");
  const { isTransientApiError, errorMessage } = await import("./retry");
  const report = await import("./report");

  // An unpriced model would still be billed, but logLlmCall throws before recording the
  // cost — the budget cap would never see that spend. Refuse up front.
  const unpriced = [AGENT_MODEL, SUMMARY_MODEL, JUDGE_MODEL].filter((m) => !PRICES[m]);
  if (unpriced.length) throw new Error(`No price for ${unpriced.join(", ")} — add it to lib/agent/cost.ts first.`);

  execSync("npx prisma migrate deploy", { stdio: "pipe", env: process.env });

  // Every case wipes and reloads the shared eval DB, so two runs at once would destroy
  // each other's worlds mid-run. A session advisory lock makes a second run refuse to
  // start. A session lock dies with its connection, and Prisma replaces its connections
  // after ~5 minutes even when busy — so the lock lives on a plain pg client: one socket
  // for the whole run, nothing to recycle it. assertLockHeld re-checks on that same
  // socket before each case; if the socket died, the query throws and the run aborts.
  const { Client } = await import("pg");
  const lockUrl = new URL(dbUrl);
  lockUrl.search = ""; // Prisma-only params (?schema=…) mean nothing to pg
  const lockDb = new Client({ connectionString: lockUrl.toString() });
  // A dropped socket emits "error"; unhandled, that crashes the process mid-case. Record
  // it instead — the next assertLockHeld query fails and aborts the run cleanly.
  lockDb.on("error", (err) => console.error(`eval lock connection error: ${err.message}`));
  await lockDb.connect();
  const { rows: [{ locked }] } = await lockDb.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1::bigint) AS locked",
    [EVAL_LOCK_KEY],
  );
  if (!locked) {
    await lockDb.end();
    throw new Error("Another eval run is using the eval database — wait for it to finish.");
  }
  async function assertLockHeld() {
    // A bigint advisory key below 2^32 is recorded with classid 0 and objid = the key.
    const { rows: [{ held }] } = await lockDb.query<{ held: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND classid = 0
        AND objid = $1 AND pid = pg_backend_pid() AND granted) AS held`,
      [EVAL_LOCK_KEY],
    );
    if (!held) throw new Error("Lost the eval-database lock — aborting before another run collides.");
  }

  // dev: the set we iterate against (and CI runs). holdout: frozen, milestones only.
  if (args.split !== "dev" && args.split !== "holdout") throw new Error("--split must be dev or holdout");
  const split = args.split;
  const splitCases = split === "holdout" ? HOLDOUT_CASES : CASES;
  const customers: Record<string, import("./fixtures/world").WorldCustomer> =
    split === "holdout" ? { ...CUSTOMERS, ...HOLDOUT_CUSTOMERS } : CUSTOMERS;
  const cases = args.filter ? splitCases.filter((c) => c.key.includes(args.filter!)) : splitCases;
  if (!cases.length) throw new Error(`No cases match --filter "${args.filter}"`);

  let gitSha: string | null = process.env.GITHUB_SHA ?? null;
  try {
    gitSha ??= execSync("git rev-parse HEAD", { stdio: "pipe" }).toString().trim();
    // Uncommitted changes mean the SHA alone can't reproduce this result — say so.
    if (execSync("git status --porcelain", { stdio: "pipe" }).toString().trim()) gitSha += "-dirty";
  } catch {
    /* not a git checkout */
  }

  const startedAt = new Date().toISOString();
  const label = args.label ?? `${split}-${AGENT_MODEL}-${startedAt.slice(0, 10)}`;
  const today = EVAL_NOW.toISOString().slice(0, 10);
  const allEmails = Object.values(customers).map((c) => c.email);

  if (args.rejudge) {
    await rejudge(args.rejudge);
    await prisma.$disconnect();
    await lockDb.end(); // an open pg socket would keep the process alive
    return;
  }

  /**
   * Re-grade stored transcripts with the current judge. Hard checks are deterministic
   * and kept as recorded; only the judge's verdicts change. This makes judge changes
   * cheap (no agent calls) and comparable (identical drafts), and the agreement report
   * shows exactly where the old and new judge disagree.
   */
  async function rejudge(file: string) {
    const prior: import("./report").EvalResults = JSON.parse(readFileSync(file, "utf8"));
    const cell = (s: string) => s.replace(/\r?\n/g, " ").replace(/\|/g, "/");
    const priorSplit = prior.summary.split ?? "dev";
    const pool = priorSplit === "holdout" ? HOLDOUT_CASES : CASES;
    const poolCustomers: Record<string, import("./fixtures/world").WorldCustomer> =
      priorSplit === "holdout" ? { ...CUSTOMERS, ...HOLDOUT_CUSTOMERS } : CUSTOMERS;
    console.log(`\nRe-judging ${prior.runs.length} runs from ${file} with ${JUDGE_MODEL} (was ${prior.summary.judgeModel})\n`);

    const rows: string[] = [];
    let runAgree = 0;
    let compared = 0;
    let critAgree = 0;
    let critCompared = 0;
    const rejudged: GradedRun[] = [];
    for (const r of prior.runs) {
      const c = pool.find((x) => x.key === r.caseKey);
      if (!c) throw new Error(`Case ${r.caseKey} no longer exists in the ${priorSplit} split`);
      const cust = poolCustomers[c.ticket.customer];
      const judge = r.infraError
        ? null
        : await judgeRun({ c, run: r, today, customerName: cust.name, customerEmail: cust.email, ticketBody: c.ticket.body });
      const passed = r.checks.every((ch) => ch.pass) && (judge === null || judge.pass);
      rejudged.push({ ...r, judge, passed });

      if (r.judge && judge && !r.judge.error && !judge.error) {
        compared++;
        if (r.judge.pass === judge.pass) runAgree++;
        // Per-criterion agreement, on criteria whose wording is unchanged.
        for (const v of judge.criteria) {
          const old = r.judge.criteria.find((o) => o.criterion === v.criterion);
          if (!old) continue;
          critCompared++;
          if (old.pass === v.pass) critAgree++;
          else rows.push(`| \`${r.caseKey}\` | ${cell(v.criterion.slice(0, 90))} | ${old.pass ? "pass" : "fail"} | ${v.pass ? "pass" : "fail"} | ${cell(v.reason)} |`);
        }
      }
      console.log(`${passed ? "✅" : "❌"} ${r.caseKey.padEnd(32)} judge ${r.judge?.pass ? "pass" : "fail"} → ${judge?.pass ? "pass" : judge ? "fail" : "—"}`);
    }

    const newLabel = args.label ?? `${prior.summary.label}-rejudged`;
    const agreementFile = `${newLabel}-agreement.md`;
    if (path.resolve(path.join("evals", "results", `${newLabel}.json`)) === path.resolve(file)) {
      throw new Error("--label would overwrite the run being re-judged; pick another label.");
    }
    const summary = report.summarize(
      { ...prior.summary, split: priorSplit, label: newLabel, judgeModel: JUDGE_MODEL },
      pool,
      rejudged,
    );
    const outDir = path.join("evals", "results");
    writeFileSync(path.join(outDir, `${newLabel}.json`), JSON.stringify({ summary, runs: rejudged }, null, 2) + "\n");
    writeFileSync(path.join(outDir, `${newLabel}.md`), report.reportMarkdown(summary));
    const pctOf = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : "n/a");
    writeFileSync(
      path.join(outDir, agreementFile),
      [
        `# Judge agreement — ${prior.summary.judgeModel} vs ${JUDGE_MODEL}`,
        "",
        `Same ${prior.runs.length} transcripts (\`${file}\`), re-judged. Hard checks unchanged.`,
        "",
        `- Run-level verdict agreement: ${runAgree}/${compared} (${pctOf(runAgree, compared)}) — reflects the judge model AND any criterion wording changes since the original run`,
        `- Criterion-level agreement (criteria with unchanged wording): ${critAgree}/${critCompared} (${pctOf(critAgree, critCompared)})`,
        "",
        "## Criterion disagreements",
        "",
        "| Case | Criterion | Old | New | New judge's reason |",
        "|---|---|---|---|---|",
        ...rows,
        "",
      ].join("\n"),
    );
    console.log("\n" + report.headlineMarkdown(summary));
    console.log(`\nRun-level agreement ${runAgree}/${compared}; criterion-level ${critAgree}/${critCompared}.`);
    console.log(`Report: evals/results/${newLabel}.md · evals/results/judge-agreement.md\n`);
  }

  console.log(
    `\nGold set: ${cases.length} cases × ${trials} trial(s) · agent ${AGENT_MODEL} · judge ${JUDGE_MODEL} · cap $${maxUsd}\n`,
  );

  type GradedRun = import("./report").GradedRun;
  type RunRecord = import("./grade").RunRecord;
  const graded: GradedRun[] = [];
  let spent = 0;
  let incomplete = false;

  /** One attempt at a case: fresh world, run the agent, read back what it did. */
  async function attempt(c: (typeof cases)[number], trial: number) {
    const world = await loadWorld(prisma, c.ticket, customers);
    const tools: import("./grade").ToolTrace[] = [];
    let error: string | null = null;
    let infraError = false;
    let result: Awaited<ReturnType<typeof runTicket>> | null = null;
    const started = Date.now();
    try {
      result = await runTicket(
        world.ticketId,
        (e) => {
          if (e.type === "tool_use") tools.push({ name: e.name, input: e.input, result: undefined });
          // Tools run sequentially, so a result always belongs to the latest tool_use.
          if (e.type === "tool_result") tools[tools.length - 1].result = e.result;
        },
        { now: EVAL_NOW },
      );
    } catch (err) {
      error = errorMessage(err);
      infraError = isTransientApiError(err);
    }

    const [ticket, aiMessages, calls] = await Promise.all([
      prisma.ticket.findUnique({ where: { id: world.ticketId }, select: { status: true, tags: true } }),
      prisma.message.findMany({
        where: { ticketId: world.ticketId, role: "AI" },
        orderBy: { createdAt: "asc" },
        select: { body: true, status: true },
      }),
      // Every model call this run made (agent turns + any compaction summary).
      prisma.llmCall.findMany({
        where: { ticketId: world.ticketId },
        select: { costUsd: true, inputTokens: true, outputTokens: true, cacheReadTokens: true },
      }),
    ]);

    const run: RunRecord = {
      caseKey: c.key,
      trial,
      error,
      infraError,
      hitIterationCap: result?.hitIterationCap ?? false,
      stopReason: result?.stopReason ?? null,
      tools,
      finalText: result?.finalText ?? "",
      finalStatus: ticket?.status ?? null,
      finalTags: ticket?.tags ?? [],
      drafts: aiMessages.filter((m) => m.status === "DRAFT").map((m) => m.body),
      sentAiMessages: aiMessages.filter((m) => m.status === "SENT").length,
      // From the LlmCall rows, not the in-memory total, so calls made before a thrown
      // error are still counted.
      costUsd: calls.reduce((a, r) => a + Number(r.costUsd), 0),
      retriedCostUsd: 0,
      totalLatencyMs: result?.totalLatencyMs ?? Date.now() - started,
      modelLatencyMs: result?.modelLatencyMs ?? 0,
      llmCalls: calls.length,
      inputTokens: calls.reduce((a, r) => a + r.inputTokens, 0),
      outputTokens: calls.reduce((a, r) => a + r.outputTokens, 0),
      cacheReadTokens: calls.reduce((a, r) => a + (r.cacheReadTokens ?? 0), 0),
      compactions: result?.compactions ?? 0,
      tokensSaved: result?.tokensSaved ?? 0,
    };
    return { run, world };
  }

  outer: for (let trial = 1; trial <= trials; trial++) {
    for (const c of cases) {
      await assertLockHeld();
      if (spent >= maxUsd) {
        console.log(`\n⛔ Budget cap reached ($${spent.toFixed(2)} ≥ $${maxUsd}) — stopping early.`);
        incomplete = true;
        break outer;
      }

      let { run, world } = await attempt(c, trial);
      let retriedCostUsd = 0;
      for (let n = 2; run.infraError && n <= CASE_ATTEMPTS && spent + retriedCostUsd + run.costUsd < maxUsd; n++) {
        retriedCostUsd += run.costUsd; // the failed attempt still cost money
        console.log(`   ↻ ${c.key}: ${run.error} — retrying (${n}/${CASE_ATTEMPTS})`);
        ({ run, world } = await attempt(c, trial));
      }
      run.retriedCostUsd = retriedCostUsd;

      const checks = hardChecks(c, run, {
        ticketId: world.ticketId,
        customerIds: world.customerIds,
        otherCustomerEmails: allEmails.filter((m) => m !== customers[c.ticket.customer].email),
      });
      const judge = run.infraError
        ? null
        : await judgeRun({
            c,
            run,
            today,
            customerName: customers[c.ticket.customer].name,
            customerEmail: customers[c.ticket.customer].email,
            ticketBody: c.ticket.body,
          });
      const passed = checks.every((ch) => ch.pass) && (judge === null || judge.pass);
      const g: GradedRun = { ...run, category: c.category, checks, judge, passed };
      graded.push(g);
      spent += run.costUsd + run.retriedCostUsd + (judge?.costUsd ?? 0);

      const skip = report.ungradedReason(g);
      const mark = skip ? "⚪" : passed ? "✅" : "❌";
      const why = skip ? `  ← ungraded: ${skip}` : passed ? "" : `  ← ${report.failureReasons(g)[0] ?? "failed"}`;
      console.log(
        `${mark} ${c.key.padEnd(32)} t${trial}  $${run.costUsd.toFixed(4)}  ` +
          `${(run.totalLatencyMs / 1000).toFixed(1).padStart(5)}s  ${String(run.tools.length).padStart(2)} tools${why}`,
      );
    }
  }

  const summary = report.summarize(
    { label, split, model: AGENT_MODEL, effort: EFFORT, judgeModel: JUDGE_MODEL, gitSha, startedAt, trials, incomplete },
    cases,
    graded,
  );

  const outDir = path.join("evals", "results");
  mkdirSync(outDir, { recursive: true });
  const results: import("./report").EvalResults = { summary, runs: graded };
  const md = report.reportMarkdown(summary);
  // latest.* tracks the dev split (what CI and the README report).
  for (const name of split === "dev" ? [label, "latest"] : [label]) {
    writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(results, null, 2) + "\n");
    writeFileSync(path.join(outDir, `${name}.md`), md);
  }
  if (args.readme && split === "dev") {
    const readme = readFileSync("README.md", "utf8");
    writeFileSync("README.md", report.updateReadmeBlock(readme, summary, "evals/results/latest.md"));
  }
  // Only now release the lock (it closes with the connection): results are on disk, so a
  // run waiting behind this one can't race us on latest.* or the README.
  await prisma.$disconnect();
  await lockDb.end();

  console.log("\n" + report.headlineMarkdown(summary));
  console.log(`\nSpend: agent $${summary.agentCostUsd.toFixed(4)} + judge $${summary.judgeCostUsd.toFixed(4)}`);
  console.log(`Report: evals/results/${label}.md\n`);

  if (incomplete) process.exit(2);
  if (summary.runs && summary.ungraded.length / summary.runs > MAX_UNGRADED_SHARE) {
    console.error(`${summary.ungraded.length}/${summary.runs} runs ungraded — too many to trust the numbers.`);
    process.exit(3);
  }
  if (summary.passAt1 < minPassRate) {
    console.error(`Pass rate ${(summary.passAt1 * 100).toFixed(1)}% is below the ${minPassRate * 100}% gate.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
