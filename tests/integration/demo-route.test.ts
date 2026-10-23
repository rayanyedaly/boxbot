import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

// The run route in demo mode: admission happens before any billed call, refusals never
// reach the agent, and every admitted run is settled. The agent and Next's request
// context are mocked; the DB is the seeded test DB.

const m = vi.hoisted(() => ({
  cookie: null as string | null,
  runTicket: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (m.cookie ? { value: m.cookie } : undefined),
    set: (_name: string, value: string) => {
      m.cookie = value;
    },
  }),
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));
vi.mock("@/lib/agent/loop", () => ({ runTicket: m.runTicket }));

import { prisma } from "../../lib/prisma";
import { POST } from "../../app/api/tickets/[id]/run/route";

const VISITOR = "00000000-0000-4000-8000-0000000000c1";
const OTHER = "00000000-0000-4000-8000-0000000000c2";
let seeded: string;
let othersTicket: string;

const call = async (id: string) => {
  const res = await POST(new Request("http://x/api"), { params: Promise.resolve({ id }) });
  return { status: res.status, text: await res.text() };
};

beforeAll(async () => {
  Object.assign(process.env, { DEMO_MODE: "true", DEMO_IP_SALT: "test-salt", DEMO_RUNS_PER_VISITOR: "10" });
  seeded = (await prisma.ticket.findFirstOrThrow({ where: { visitorId: null, status: "OPEN" } })).id;
  await prisma.demoVisitor.upsert({ where: { id: OTHER }, create: { id: OTHER, ipHash: "other" }, update: {} });
  const customer = await prisma.customer.findFirstOrThrow();
  othersTicket = (
    await prisma.ticket.create({ data: { customerId: customer.id, subject: "Other's", visitorId: OTHER } })
  ).id;
});

beforeEach(async () => {
  m.cookie = VISITOR;
  m.runTicket.mockReset();
  await prisma.demoRun.deleteMany();
});

afterAll(async () => {
  await prisma.demoRun.deleteMany();
  await prisma.ticket.delete({ where: { id: othersTicket } });
  await prisma.demoVisitor.deleteMany({ where: { id: { in: [VISITOR, OTHER] } } });
  for (const k of ["DEMO_MODE", "DEMO_IP_SALT", "DEMO_RUNS_PER_VISITOR"]) delete process.env[k];
});

describe("POST /api/tickets/[id]/run in demo mode", () => {
  it("admits, runs, and settles the run at its reported cost", async () => {
    m.runTicket.mockImplementation(async (_id: string, onEvent: (e: unknown) => void) => {
      onEvent({ type: "llm_call", model: "m", costUsd: 0.01, inputTokens: 1, outputTokens: 1 });
      return { stopReason: "end_turn", toolCalls: [], llmCalls: 1, totalCostUsd: 0.0123, compactions: 0, tokensSaved: 0, hitIterationCap: false };
    });
    const res = await call(seeded);
    expect(res.status).toBe(200);
    expect(res.text).toContain('"type":"done"');
    const run = await prisma.demoRun.findFirstOrThrow({ where: { visitorId: VISITOR } });
    expect(run.status).toBe("DONE");
    expect(Number(run.costUsd)).toBeCloseTo(0.0123, 6);
    expect(run.ipHash).not.toContain("203.0.113.7"); // only the salted hash is stored
  });

  it("settles a failed run as ERROR with the cost it had already reported (above the reserve)", async () => {
    m.runTicket.mockImplementation(async (_id: string, onEvent: (e: unknown) => void) => {
      onEvent({ type: "llm_call", model: "m", costUsd: 0.07, inputTokens: 1, outputTokens: 1 });
      throw new Error("anthropic overloaded");
    });
    const res = await call(seeded);
    expect(res.text).toContain('"type":"error"');
    const run = await prisma.demoRun.findFirstOrThrow({ where: { visitorId: VISITOR } });
    expect(run.status).toBe("ERROR");
    expect(Number(run.costUsd)).toBeCloseTo(0.07, 6);
  });

  it("refuses over the limit without calling the agent", async () => {
    await prisma.demoVisitor.upsert({ where: { id: VISITOR }, create: { id: VISITOR, ipHash: "x" }, update: {} });
    await prisma.demoRun.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({ visitorId: VISITOR, ipHash: "x", ticketId: `t${i}`, status: "DONE" as const })),
    });
    const res = await call(seeded);
    expect(res.status).toBe(429);
    expect(JSON.parse(res.text)).toMatchObject({ error: "visitor_limit" });
    expect(m.runTicket).not.toHaveBeenCalled();
  });

  it("404s another visitor's ticket and unknown ids, without running or creating a visitor", async () => {
    expect((await call(othersTicket)).status).toBe(404);
    m.cookie = null;
    expect((await call("does-not-exist")).status).toBe(404);
    expect(m.cookie).toBeNull(); // no visitor minted for a junk id
    expect(m.runTicket).not.toHaveBeenCalled();
  });

  it("with DEMO_MODE off, runs without admission or visitor rows", async () => {
    process.env.DEMO_MODE = "false";
    m.runTicket.mockResolvedValue({ stopReason: "end_turn", toolCalls: [], llmCalls: 0, totalCostUsd: 0, compactions: 0, tokensSaved: 0, hitIterationCap: false });
    m.cookie = null;
    expect((await call(seeded)).status).toBe(200);
    expect(await prisma.demoRun.count()).toBe(0);
    expect(m.cookie).toBeNull();
    process.env.DEMO_MODE = "true";
  });
});
