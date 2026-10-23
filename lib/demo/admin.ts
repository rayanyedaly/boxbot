// lib/demo/admin.ts — the /admin page's token check (constant-time; closed when unset).

import { timingSafeEqual } from "node:crypto";

export function adminTokenOk(given: string | undefined, want = process.env.DEMO_ADMIN_TOKEN): boolean {
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
