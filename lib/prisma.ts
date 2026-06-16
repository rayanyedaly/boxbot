// lib/prisma.ts
//
// Shared PrismaClient singleton for the agent layer and (Phase 2) the app.
// Guarded against Next's dev hot-reload spawning a new connection pool per reload.
// Note: lib/agent/tools.ts intentionally keeps its own client (pre-authored).

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
