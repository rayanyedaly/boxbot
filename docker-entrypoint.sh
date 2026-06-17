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
until node node_modules/prisma/build/index.js migrate deploy; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[entrypoint] migrate deploy failed after ${max_attempts} attempts; giving up." >&2
    exit 1
  fi
  echo "[entrypoint] migrate deploy failed (attempt ${attempt}/${max_attempts}); retrying in 5s…" >&2
  attempt=$((attempt + 1))
  sleep 5
done

if [ "$SEED_ON_START" = "true" ]; then
  # SEED_SKIP_IF_POPULATED makes the seed a no-op when data already exists, so a
  # task restart/replacement can never wipe a populated DB. (Local `npm run
  # db:seed`, without this flag, keeps its clean-slate reseed behavior.)
  echo "[entrypoint] seeding demo data (only if the DB is empty)…"
  SEED_SKIP_IF_POPULATED=true node node_modules/prisma/build/index.js db seed
fi

echo "[entrypoint] starting Next.js…"
exec node server.js
