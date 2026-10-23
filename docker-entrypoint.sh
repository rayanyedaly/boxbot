#!/bin/sh
# Container entrypoint: bring the schema up to date, optionally seed the demo
# data, then hand off to the Next.js standalone server.
set -e

# The CDK stack injects discrete DB_* vars (RDS-generated secret + endpoint).
# Compose them into the DATABASE_URL Prisma expects. Respect an already-set
# DATABASE_URL (e.g. plain `docker run` against an external Postgres).
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  # URL-encode the credentials: an RDS-generated password can contain characters
  # (#, ?, %, &, =) that would otherwise corrupt the postgres:// URL. node is
  # already present in the image, so use it as the encoder.
  DB_USER_ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.env.DB_USER || ""))')
  DB_PASSWORD_ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.env.DB_PASSWORD || ""))')
  # NB: sslmode=require encrypts the connection but does NOT verify the server
  # certificate — acceptable for a throwaway demo, not for production.
  export DATABASE_URL="postgresql://${DB_USER_ENC}:${DB_PASSWORD_ENC}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public&sslmode=require"
fi

# A freshly-provisioned RDS instance may not accept connections the instant the
# task starts. Retry the migration a few times before giving up. (The `until`
# condition is exempt from `set -e`, so a failed attempt won't kill the script.)
echo "[entrypoint] applying migrations (prisma migrate deploy)…"
attempt=1
max_attempts=10
until prisma migrate deploy; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[entrypoint] migrate deploy failed after ${max_attempts} attempts; giving up." >&2
    exit 1
  fi
  echo "[entrypoint] migrate deploy failed (attempt ${attempt}/${max_attempts}); retrying in 5s…" >&2
  attempt=$((attempt + 1))
  sleep 5
done

# RUN_MODE=reset is the public demo's nightly cron (railway/railway.ts): reseed with
# fresh dates, keep cost history and visitor counts, then exit instead of serving.
if [ "$RUN_MODE" = "reset" ]; then
  echo "[entrypoint] nightly demo reset (SEED_MODE=demo-reset)…"
  SEED_MODE=demo-reset exec prisma db seed
fi

# On Railway this image is the public demo: refuse to run with the guardrails off by
# accident (DEMO_MODE unset or misspelled), since that would leave runs unlimited.
if [ -n "$RAILWAY_ENVIRONMENT" ] && [ "$DEMO_MODE" != "true" ] && [ "$DEMO_MODE" != "false" ]; then
  echo "[entrypoint] on Railway, DEMO_MODE must be set to true or false; refusing to start." >&2
  exit 1
fi

# The public demo hashes client IPs with this salt; refuse to serve without it rather
# than fail on the first visitor's request.
if [ "$DEMO_MODE" = "true" ] && [ -z "$DEMO_IP_SALT" ]; then
  echo "[entrypoint] DEMO_MODE=true requires DEMO_IP_SALT; refusing to start." >&2
  exit 1
fi

if [ "$SEED_ON_START" = "true" ]; then
  # SEED_SKIP_IF_POPULATED makes the seed a no-op when data already exists, so a
  # task restart/replacement can never wipe a populated DB. (Local `npm run
  # db:seed`, without this flag, keeps its clean-slate reseed behavior.)
  echo "[entrypoint] seeding demo data (only if the DB is empty)…"
  SEED_SKIP_IF_POPULATED=true prisma db seed
fi

echo "[entrypoint] starting Next.js…"
exec node server.js
