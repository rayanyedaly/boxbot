import { describe, it, expect, beforeEach, vi } from "vitest";

// Shared spies, hoisted above the vi.mock factories.
const mocks = vi.hoisted(() => ({
  streamMock: vi.fn(),
  logLlmCall: vi.fn(async () => 0.01),
  runTool: vi.fn(async () => ({ matches: [{ id: "c1", name: "Maya Chen" }] })),
  maybeCompact: vi.fn(async (args: { messages: unknown[] }) => ({
    messages: args.messages,
    compacted: false,
    tokensBefore: 0,
    tokensAfter: 0,
    tokensSaved: 0,
    summaryCostUsd: 0,
  })),
}));

vi.mock("../../lib/agent/llm", () => ({
  getAnthropic: () => ({ messages: { stream: mocks.streamMock } }),
  logLlmCall: mocks.logLlmCall,
  AGENT_MODEL: "claude-sonnet-5-5",
  MAX_TOKENS: 16000,
  supportsEffort: () => true,
  EFFORT: "medium",
  MAX_ITERATIONS: 3, // small cap so the runaway test is fast; happy path needs only 2
}));
vi.mock("../../lib/agent/tools", () => ({ toolDefinitions: [], runTool: mocks.runTool }));
vi.mock("../../lib/agent/context", () => ({
  maybeCompact: mocks.maybeCompact,
  liveContextTokens: () => 100,
}));
vi.mock("../../lib/prisma", () => ({
  prisma: {
    ticket: {
      findUnique: vi.fn(async () => ({
        id: "t1",
        subject: "Where's my refund?",
        channel: "EMAIL",
        priority: "HIGH",
        customer: { name: "Maya Chen", email: "maya.chen@example.com" },
        messages: [{ role: "CUSTOMER", body: "Where is it?" }],
      })),
    },
  },
}));

import { runAgent, runTicket } from "../../lib/agent/loop";

// A fake MessageStream: the loop only uses .on("text", cb) and await .finalMessage().
function fakeStream(finalMsg: unknown) {
  const stream = { on: vi.fn(() => stream), finalMessage: vi.fn(async () => finalMsg) };
  return stream;
}

const toolUseTurn = {
  stop_reason: "tool_use",
  usage: { input_tokens: 100, output_tokens: 20 },
  content: [{ type: "tool_use", id: "tu_1", name: "search_customer", input: { query: "maya" } }],
};
const endTurn = {
  stop_reason: "end_turn",
  usage: { input_tokens: 120, output_tokens: 30 },
  content: [{ type: "text", text: "Here is your answer." }],
};

beforeEach(() => {
  mocks.streamMock.mockReset();
  mocks.runTool.mockClear();
  mocks.logLlmCall.mockClear();
});

describe("runAgent — hand-rolled tool-use loop", () => {
  it("runs a tool and feeds the tool_result back into the next turn", async () => {
    mocks.streamMock
      .mockReturnValueOnce(fakeStream(toolUseTurn))
      .mockReturnValueOnce(fakeStream(endTurn));

    const result = await runAgent({ initialUserMessage: "where's my refund?" });

    // The tool was executed with the model's emitted input.
    expect(mocks.runTool).toHaveBeenCalledTimes(1);
    expect(mocks.runTool).toHaveBeenCalledWith("search_customer", { query: "maya" });

    // The second model call received a user turn carrying the matching tool_result.
    const secondCallMessages = mocks.streamMock.mock.calls[1][0].messages;
    const lastMsg = secondCallMessages[secondCallMessages.length - 1];
    expect(lastMsg.role).toBe("user");
    expect(lastMsg.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1" });
    expect(lastMsg.content[0].content).toBe(JSON.stringify({ matches: [{ id: "c1", name: "Maya Chen" }] }));

    // One LlmCall logged per model turn; final text + outcome surfaced.
    expect(mocks.logLlmCall).toHaveBeenCalledTimes(2);
    expect(result.llmCalls).toBe(2);
    expect(result.toolCalls.map((t) => t.name)).toEqual(["search_customer"]);
    expect(result.finalText).toBe("Here is your answer.");
    expect(result.stopReason).toBe("end_turn");
    expect(result.hitIterationCap).toBe(false);
  });

  it("stops at MAX_ITERATIONS when the model never ends the turn", async () => {
    mocks.streamMock.mockReturnValue(fakeStream(toolUseTurn)); // always asks for a tool

    const result = await runAgent({ initialUserMessage: "loop forever" });

    expect(result.hitIterationCap).toBe(true);
    expect(result.llmCalls).toBe(3); // MAX_ITERATIONS
    expect(mocks.runTool).toHaveBeenCalledTimes(3);
  });

  it("emits tool_use / tool_result / llm_call events to onEvent", async () => {
    mocks.streamMock
      .mockReturnValueOnce(fakeStream(toolUseTurn))
      .mockReturnValueOnce(fakeStream(endTurn));
    const events: string[] = [];

    await runAgent({ initialUserMessage: "hi", onEvent: (e) => events.push(e.type) });

    expect(events).toContain("tool_use");
    expect(events).toContain("tool_result");
    expect(events).toContain("llm_call");
  });
});

describe("runTicket", () => {
  it("tells the agent today's date (UTC) alongside the ticket context", async () => {
    mocks.streamMock.mockReturnValueOnce(fakeStream(endTurn));

    await runTicket("t1", undefined, { now: new Date("2026-09-15T23:30:00-05:00") });

    const first = mocks.streamMock.mock.calls[0][0].messages[0].content as string;
    expect(first).toContain("today: 2026-09-16"); // 23:30 at UTC-5 is already the 16th in UTC
    expect(first).toContain("ticketId: t1");
    expect(first).toContain("customer email: maya.chen@example.com");
  });
});

describe("runAgent latency", () => {
  it("counts model time in modelLatencyMs and everything in totalLatencyMs", async () => {
    let clock = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock);
    const timed = (msg: unknown) => {
      const stream = {
        on: vi.fn(() => stream),
        finalMessage: vi.fn(async () => {
          clock += 300; // each model call takes 300ms
          return msg;
        }),
      };
      return stream;
    };
    mocks.streamMock.mockReturnValueOnce(timed(toolUseTurn)).mockReturnValueOnce(timed(endTurn));
    mocks.runTool.mockImplementationOnce(async () => {
      clock += 500; // the tool takes 500ms
      return { matches: [] };
    });

    const result = await runAgent({ initialUserMessage: "hi" });
    nowSpy.mockRestore();

    expect(result.modelLatencyMs).toBe(600);
    expect(result.totalLatencyMs).toBe(1100);
  });
});
