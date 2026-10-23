// lib/demo/visitor.ts
//
// Who is visiting the public demo, without a login: a random id in an httpOnly cookie,
// plus a salted hash of the client IP (the raw IP is never stored). Clearing cookies
// mints a new visitor, which is why runs are also capped per IP hash.

import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { TICKET_LIMITS } from "./config";

const COOKIE = "bb_vid";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Visitor = { id: string; ipHash: string };

export function hashIp(ip: string): string {
  const salt = process.env.DEMO_IP_SALT;
  if (!salt) throw new Error("DEMO_IP_SALT is not set");
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

// Railway's edge sets X-Real-IP. The fallback takes the right-most X-Forwarded-For hop
// (added by the nearest proxy); the left-most entries are whatever the client sent.
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
  return hashIp(ip);
}

/** The visitor id from the cookie, if it holds a well-formed one. Safe in Server Components. */
export async function readVisitorId(): Promise<string | null> {
  const v = (await cookies()).get(COOKIE)?.value;
  return v && UUID.test(v) ? v : null;
}

/**
 * The current visitor, creating the cookie and row on first contact. Sets a cookie,
 * so call it only from a Route Handler or Server Action.
 */
export async function ensureVisitor(): Promise<Visitor> {
  const ipHash = await clientIpHash();
  let id = await readVisitorId();
  if (!id) {
    id = randomUUID();
    (await cookies()).set(COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  await prisma.demoVisitor.upsert({
    where: { id },
    create: { id, ipHash },
    update: { ipHash, lastSeen: new Date() },
  });
  return { id, ipHash };
}

const clean = (s: unknown) =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, TICKET_LIMITS.nameMax) || null : null;

export async function saveVisitorProfile(name: unknown, company: unknown): Promise<void> {
  const v = await ensureVisitor();
  await prisma.demoVisitor.update({ where: { id: v.id }, data: { name: clean(name), company: clean(company) } });
}
