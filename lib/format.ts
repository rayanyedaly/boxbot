// lib/format.ts
//
// Small presentation helpers shared by the UI. Decimal -> number conversion lives
// here because Prisma.Decimal can't cross the Server -> Client component boundary;
// convert before passing cost values to any client leaf.

import { Prisma } from "@prisma/client";

/** Prisma.Decimal | number | null -> number. */
export function decToNumber(
  d: Prisma.Decimal | number | string | null | undefined,
): number {
  if (d == null) return 0;
  return typeof d === "number" ? d : Number(d);
}

/** Format a USD amount. Costs here are tiny (cents), so default to 4 dp. */
export function formatUsd(n: number, dp = 4): string {
  return `$${n.toFixed(dp)}`;
}

/** Thousands-separated integer (token counts). */
export function formatTokens(n: number): string {
  return n.toLocaleString("en-US");
}

/** Up-to-two-letter initials from a name. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Deterministic pastel avatar colors from a name (stable across renders/themes). */
export function avatarColors(name: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return { bg: `hsl(${h} 60% 92%)`, fg: `hsl(${h} 55% 38%)` };
}

/** Compact relative age, e.g. "now", "5m", "2h", "3d", "2mo". */
export function timeAgo(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

/** Compact UTC date label, e.g. "Jun 16" (UTC so server/client agree). */
export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}
