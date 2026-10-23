// lib/demo/context.ts
//
// The public-demo view of the current request for Server Components: who's visiting
// (cookie, read-only) and their run quota. Null outside DEMO_MODE. cache() shares one
// lookup between the sidebar and the page in a single render.

import { cache } from "react";
import { demoEnabled } from "./config";
import { clientIpHash, readVisitorId } from "./visitor";
import { visitorQuota, type Quota } from "./runs";

export type DemoContext = { visitorId: string | null; quota: Quota };

export const demoContext = cache(async (): Promise<DemoContext | null> => {
  if (!demoEnabled()) return null;
  const visitorId = await readVisitorId();
  const quota = await visitorQuota({ visitorId, ipHash: await clientIpHash() });
  return { visitorId, quota };
});
