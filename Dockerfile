# syntax=docker/dockerfile:1
#
# Multi-stage build for the Next.js (App Router) inbox agent + Prisma.
#
#   deps     -> install the full dependency tree (dev deps needed to build)
#   builder  -> generate the Prisma client for this platform, then `next build`
#   runner   -> lean runtime: the standalone server + only what Prisma needs to
#               apply migrations and (optionally) seed the demo data
#
# Debian slim (not Alpine) is deliberate: Prisma's engines are most reliable on
# glibc + OpenSSL 3, which `node:22-bookworm-slim` provides without musl quirks.
#
# Build for the target arch — the CDK task pins linux/amd64. On Apple Silicon:
#   docker buildx build --platform linux/amd64 -t <tag> .
# A mismatched build arch bakes a Prisma engine the running task cannot load.

# ---- Base -------------------------------------------------------------------
FROM node:22-bookworm-slim AS base
# openssl: Prisma engine TLS. ca-certificates: TLS to RDS and the Anthropic API.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- Dependencies -----------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ---- Builder ----------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the client for the build/runtime platform (same OS in both stages),
# then emit the standalone server.
RUN npx prisma generate
RUN npm run build

# ---- Runner -----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
# Bind all interfaces so the load balancer can reach the task.
ENV HOSTNAME=0.0.0.0

# Run as an unprivileged user.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Next standalone server + the assets it does not trace (static + public).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma: schema + migrations + CLI + engines, so the entrypoint can run
# `migrate deploy` (and `db seed` when SEED_ON_START=true) at boot.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
# package.json carries the `prisma.seed` hook (tsx prisma/seed.ts).
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# tsx for the optional one-shot demo seed.
RUN npm install -g tsx@4

COPY --chown=nextjs:nodejs docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
