// railway/railway.ts
//
// The public demo on Railway, as code (Railway IaC, `railway/iac` SDK). This is the
// demo host; infra/ (AWS CDK) is a separate, unrelated artifact.
//
// Kept in railway/ rather than Railway's default .railway/, so every CLI call passes
// --file — use the npm scripts: `npm run railway:plan`, then `npm run railway:apply`.
// Services build from GitHub on push to main. Creating a service (first apply) also
// starts a deploy, which fails until the secrets are set — see railway/README.md.
//
// This file is the whole project: a resource left out of it is DELETED on apply.
// Always read the plan first. Secrets are never committed — preserve() keeps the value
// set in Railway (see railway/README.md for the one-time setup).

import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

const REPO = "rayanyedaly/boxbot";
const REGION = "us-east4-eqdc4a"; // Railway's US East region; recruiters are mostly US-based

export default defineRailway(() => {
  const db = postgres("postgres", { region: REGION });

  // Files that change what the app image contains. Eval results, docs, infra/ and the
  // CI bot's README refreshes don't redeploy the demo.
  const appFiles = [
    "/app/**",
    "/lib/**",
    "/prisma/**",
    "/public/**",
    "/Dockerfile",
    "/docker-entrypoint.sh",
    "/package.json",
    "/package-lock.json",
    "/next.config.mjs",
    "/postcss.config.mjs",
    "/tsconfig.json",
  ];
  const image = { builder: "DOCKERFILE" as const, dockerfilePath: "Dockerfile", watchPatterns: appFiles };

  const models = {
    ANTHROPIC_MODEL: "claude-sonnet-5-5",
    ANTHROPIC_SUMMARY_MODEL: "claude-haiku-5-5",
  };

  const web = service("web", {
    source: github(REPO, { branch: "main" }),
    build: image,
    healthcheck: "/api/health",
    healthcheckTimeout: 300, // first boot runs migrations + the seed before the server listens
    replicas: { [REGION]: 1 },
    // Restarts on failure (Railway's default policy, which it stores as unset), up to 5 times.
    deploy: { restartPolicyMaxRetries: 5 },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      PORT: "3000", // pin it, so the server, healthcheck and generated domain agree
      // A key from a dedicated Anthropic workspace with a monthly spend limit: the hard
      // backstop if the in-app caps ever fail.
      ANTHROPIC_API_KEY: preserve(),
      ...models,
      SEED_ON_START: "true", // seeds only an empty DB; never wipes a populated one
      DEMO_MODE: "true",
      DEMO_IP_SALT: preserve(),
      DEMO_ADMIN_TOKEN: preserve(),
      DEMO_RUNS_PER_VISITOR: "10",
      DEMO_RUNS_PER_IP: "30",
      DEMO_DAILY_USD: "3",
      DEMO_MONTHLY_USD: "25",
      DEMO_MAX_CONCURRENT: "3",
    },
  });

  // Nightly reset: fresh seed data (relative dates stay current), visitor tickets cleared,
  // cost history and visitor counts kept. 08:00 UTC is ~3–4am US Eastern.
  const reset = service("demo-reset", {
    source: github(REPO, { branch: "main" }),
    build: image,
    replicas: { [REGION]: 1 },
    // Railway doesn't restart cron jobs; a failed reset (e.g. a run admitted mid-reset)
    // simply runs again the next night. The reseed is idempotent.
    deploy: { cronSchedule: "0 8 * * *", restartPolicyType: "NEVER" },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      RUN_MODE: "reset",
    },
  });

  return project("boxbot", { resources: [db, web, reset] });
});
