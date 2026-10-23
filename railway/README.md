# Railway: the public demo

The live demo runs on Railway, declared in [`railway.ts`](railway.ts) with Railway
Infrastructure as Code. This folder is separate from [`infra/`](../infra), the AWS CDK
stack, which is a portfolio artifact and not the demo host.

| Resource | What it is |
|---|---|
| `postgres` | Railway Postgres, US East |
| `web` | The Next.js app from the repo's `Dockerfile`. Runs migrations on boot and seeds an empty DB. `DEMO_MODE=true` turns on the guardrails |
| `demo-reset` | Same image as a cron job (`0 8 * * *` UTC, `RUN_MODE=reset`). Reseeds the demo data so relative dates stay current and visitor tickets are cleared, while keeping cost history and visitor counts |

## Why `railway/` and not `.railway/`

Railway's CLI looks for `.railway/railway.ts` by default. This repo keeps it under
`railway/`, next to `infra/`, so every command passes `--file`. The npm scripts do that:

```bash
npm run railway:plan    # railway config plan  --file railway/railway.ts  (read-only)
npm run railway:apply   # railway config apply --file railway/railway.ts
```

`railwayapp/config@v1` (plan comments on PRs, apply on merge) watches `.railway/**`, so
it isn't wired up here. Apply from the CLI.

**The file is the whole project.** A resource missing from it is deleted on apply.
Read the plan before every apply.

## First deploy

1. **Anthropic key.** Create a key in a dedicated Anthropic Console workspace and set a
   monthly spend limit on that workspace (about $30). The in-app caps ($3/day, $25/month)
   come first; the workspace limit is the backstop if they ever fail.
2. **Project.** From the repo root run `railway init` (or `railway link` to an existing
   project). Then run `npm run railway:plan`, check it, and run `npm run railway:apply`.
   Creating the services starts a first deploy of `web`. That deploy fails until step 3,
   because the entrypoint refuses to start in demo mode without `DEMO_IP_SALT`. Setting
   the variables redeploys it.

   On Windows, if the plan fails with "requires Railway CLI 5.42.1 or newer", the SDK
   couldn't find the CLI binary (it runs `$env:_ --version`, falling back to `railway`,
   which Windows can't resolve without `.exe`). Point `_` at the binary from PowerShell
   (Git Bash overwrites `_` on every command):
   ```powershell
   $env:_ = 'C:\Program Files\nodejs\node_modules\@railway\cli\bin\railway.exe'
   railway config plan --file railway/railway.ts
   ```
3. **Secrets.** These are `preserve()` in the file, so they never enter git. Set them once
   on the `web` service:
   ```bash
   railway variables --service web \
     --set "ANTHROPIC_API_KEY=sk-ant-..." \
     --set "DEMO_IP_SALT=$(openssl rand -hex 32)" \
     --set "DEMO_ADMIN_TOKEN=$(openssl rand -hex 24)"
   ```
   The app refuses to start in demo mode without `DEMO_IP_SALT`.
4. **Domain.** Run `railway domain --service web`. Railway-generated domains aren't
   committed to IaC. Run `npm run railway:plan` again afterwards and confirm it shows no
   domain or variable deletions.
5. **Check the IP header once.** The per-IP limits hash `X-Real-IP` (falling back to the
   right-most `X-Forwarded-For` hop). Railway's edge is expected to set it. Run a couple
   of agent runs from two networks (e.g. laptop and phone hotspot), then check on
   `/admin` that they appear as different visitors whose runs count separately. If every
   visitor shares one IP hash, the per-IP caps act globally; fix the header choice in
   `lib/demo/visitor.ts` before sharing the link.
6. **Deploys.** Pushes to `main` build both services from the Dockerfile. The watch
   patterns in `railway.ts` skip changes that only touch evals, docs or `infra/`, which
   includes the CI bot's README refreshes.

## Demo guardrails (set in `railway.ts`)

| Variable | Default | |
|---|---|---|
| `DEMO_RUNS_PER_VISITOR` | 10 | Agent runs per browser (cookie), rolling 24h |
| `DEMO_RUNS_PER_IP` | 30 | Per IP hash. Looser because offices share an IP |
| `DEMO_DAILY_USD` / `DEMO_MONTHLY_USD` | 3 / 25 | Spend caps, counted from each run's real logged cost |
| `DEMO_MAX_CONCURRENT` | 3 | Agent runs in flight across all visitors |

**Visitors page:** `https://<domain>/admin?token=<DEMO_ADMIN_TOKEN>` lists visitors, their
optional name and company, runs, and spend.
