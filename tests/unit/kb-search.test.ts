import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({ prisma: {} }));

import { kbLimit, orQuery } from "../../lib/agent/kb-search";

describe("orQuery", () => {
  it("ORs distinct lowercase terms", () => {
    expect(orQuery("Refund policy, refund ANNUAL plan")).toBe("refund | policy | annual | plan");
  });

  it("drops tsquery operators so input can't change the query's shape", () => {
    expect(orQuery("refund & !(policy | :* <-> 'x' \\")).toBe("refund | policy | x");
  });

  it("keeps non-ASCII words whole", () => {
    expect(orQuery("Rückerstattung café 返金")).toBe("rückerstattung | café | 返金");
  });

  it("returns null when nothing searchable is left", () => {
    expect(orQuery("!!! ???")).toBeNull();
    expect(orQuery("")).toBeNull();
  });
});

describe("kbLimit", () => {
  it("defaults to 3 for missing or non-numeric limits", () => {
    for (const v of [undefined, null, "abc", NaN, 0]) expect(kbLimit(v), String(v)).toBe(3);
  });

  it("clamps to 1..10 and truncates", () => {
    expect(kbLimit(-5)).toBe(1);
    expect(kbLimit(2.9)).toBe(2);
    expect(kbLimit("5")).toBe(5);
    expect(kbLimit(1000)).toBe(10);
    expect(kbLimit(Infinity)).toBe(3);
  });
});
