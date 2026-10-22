import { describe, it, expect, beforeEach, vi } from "vitest";

const m = vi.hoisted(() => ({
  countTokens: vi.fn(),
  create: vi.fn(),
  logLlmCall: vi.fn(async () => 0.002),
  compactionCreate: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})),
}));

vi.mock("../../lib/agent/llm", () => ({
  getAnthropic: () => ({ messages: { countTokens: m.countTokens, create: m.create } }),
  logLlmCall: m.logLlmCall,
  AGENT_MODEL: "claude-sonnet-5-5",
  SUMMARY_MODEL: "claude-haiku-5-5",
  COMPACTION_TOKEN_THRESHOLD: 12000,
  RECENT_TURNS_KEPT: 4,
}));
vi.mock("../../lib/prisma", () => ({ prisma: { compaction: { create: m.compactionCreate } } }));

import { maybeCompact } from "../../lib/agent/context";
import type Anthropic from "@anthropic-ai/sdk";

// N rounds of [assistant(tool_use), user(tool_result)] after an initial user turn.
function buildMessages(rounds: number): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = [{ role: "user", content: "initial question" }];
  for (let i = 0; i < rounds; i++) {
    msgs.push({ role: "assistant", content: [{ type: "tool_use", id: `tu_${i}`, name: "search_customer", input: {} }] });
    msgs.push({ role: "user", content: [{ type: "tool_result", tool_use_id: `tu_${i}`, content: "{}" }] });
  }
  return msgs;
}

const base = {
  ticketId: "t1",
  system: [] as Anthropic.TextBlockParam[],
  tools: [] as Anthropic.Tool[],
  initialMessage: "initial question",
};

beforeEach(() => {
  m.countTokens.mockReset();
  m.create.mockReset();
  m.compactionCreate.mockClear();
  m.logLlmCall.mockClear();
});

describe("maybeCompact — context compaction", () => {
  it("is a no-op under the token threshold", async () => {
    const messages = buildMessages(6);
    const res = await maybeCompact({ ...base, messages, liveTokens: 5000 });

    expect(res.compacted).toBe(false);
    expect(res.tokensBefore).toBe(5000);
    expect(res.tokensAfter).toBe(5000);
    expect(res.summaryCostUsd).toBe(0);
    expect(res.messages).toBe(messages); // untouched
    expect(m.countTokens).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("is a no-op over the threshold when there are too few turns to collapse", async () => {
    const messages = buildMessages(4); // 4 assistant turns == RECENT_TURNS_KEPT
    const res = await maybeCompact({ ...base, messages, liveTokens: 20000 });

    expect(res.compacted).toBe(false);
    expect(m.countTokens).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("summarizes older turns and reduces the token count", async () => {
    m.countTokens
      .mockResolvedValueOnce({ input_tokens: 18000 }) // before
      .mockResolvedValueOnce({ input_tokens: 6000 }); // after
    m.create.mockResolvedValue({
      content: [{ type: "text", text: "summary note" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 500, output_tokens: 80 },
    });

    const messages = buildMessages(6);
    const res = await maybeCompact({ ...base, messages, liveTokens: 20000 });

    expect(res.compacted).toBe(true);
    expect(res.tokensBefore).toBe(18000);
    expect(res.tokensAfter).toBe(6000);
    expect(res.tokensAfter).toBeLessThan(res.tokensBefore); // it reduced
    expect(res.tokensSaved).toBe(12000);
    expect(res.summaryCostUsd).toBe(0.002);

    // The compacted array starts with the summary user message, then recent turns.
    expect(res.messages[0].role).toBe("user");
    expect(String(res.messages[0].content)).toContain("Earlier conversation compacted");
    expect(res.messages.length).toBeLessThan(messages.length);

    // The event is persisted for the dashboard's real savings figure.
    expect(m.compactionCreate).toHaveBeenCalledTimes(1);
    expect(m.compactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokensBefore: 18000, tokensAfter: 6000, tokensSaved: 12000 }),
      }),
    );
  });

  function compactOnce(
    messages: Anthropic.MessageParam[],
    summary: string,
    opts: { initialMessage?: string; stopReason?: string; before?: number } = {},
  ) {
    m.countTokens
      .mockResolvedValueOnce({ input_tokens: opts.before ?? 18000 })
      .mockResolvedValueOnce({ input_tokens: 6000 });
    m.create.mockResolvedValueOnce({
      content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: summary }],
      stop_reason: opts.stopReason ?? "end_turn",
      usage: { input_tokens: 500, output_tokens: 80 },
    });
    const initialMessage = opts.initialMessage ?? base.initialMessage;
    return maybeCompact({ ...base, initialMessage, messages, liveTokens: 20000 });
  }

  it("keeps the initial ticket message verbatim and appends the summary to it", async () => {
    const initialMessage = "today: 2026-09-15\nticketId: t_abc\nbody: help";
    const messages = buildMessages(6);
    messages[0] = { role: "user", content: initialMessage };

    const res = await compactOnce(messages, "summary one", { initialMessage });

    const first = String(res.messages[0].content);
    expect(first.startsWith("today: 2026-09-15\nticketId: t_abc\nbody: help\n\n")).toBe(true);
    expect(first).toContain("summary one");
    expect(res.messages[1].role).toBe("assistant"); // alternation intact
  });

  it("replaces the previous summary on a second compaction instead of stacking it", async () => {
    const once = await compactOnce(buildMessages(6), "summary one");
    const grown = [...once.messages, ...buildMessages(6).slice(1)];

    const twice = await compactOnce(grown, "summary two");

    const first = String(twice.messages[0].content);
    expect(first).toContain("summary two");
    expect(first).not.toContain("summary one");
    expect(first.match(/Earlier conversation compacted/g)).toHaveLength(1);
    expect(first.startsWith("initial question\n\n")).toBe(true);
  });

  it("rebuilds from the original message, so customer text that mimics the summary note survives", async () => {
    const initialMessage = "body: hi\n\n[Earlier conversation compacted to save context. not really";
    const messages = buildMessages(6);
    messages[0] = { role: "user", content: initialMessage };

    const res = await compactOnce(messages, "summary", { initialMessage });

    expect(String(res.messages[0].content).startsWith(initialMessage + "\n\n")).toBe(true);
  });

  it("keeps the turns when the summary is cut short or empty (spend still counted)", async () => {
    const messages = buildMessages(6);
    const cut = await compactOnce(messages, "partial", { stopReason: "max_tokens" });
    expect(cut.compacted).toBe(false);
    expect(cut.messages).toBe(messages);
    expect(cut.summaryCostUsd).toBe(0.002);

    const empty = await compactOnce(messages, "");
    expect(empty.compacted).toBe(false);
    expect(m.compactionCreate).not.toHaveBeenCalled();
  });

  it("skips compaction when the real token count is under the threshold", async () => {
    const res = await compactOnce(buildMessages(6), "summary", { before: 9000 });
    expect(res.compacted).toBe(false);
    expect(m.create).not.toHaveBeenCalled(); // no summarizer spend
  });

  it("drops thinking blocks from the turns it keeps (their prefix changed)", async () => {
    const messages = buildMessages(6).map((msg) =>
      msg.role === "assistant" && Array.isArray(msg.content)
        ? { ...msg, content: [{ type: "thinking", thinking: "", signature: "sig" }, ...msg.content] }
        : msg,
    ) as Anthropic.MessageParam[];

    const res = await compactOnce(messages, "summary");

    const kept = res.messages.filter((x) => x.role === "assistant");
    expect(kept.length).toBeGreaterThan(0);
    for (const a of kept) {
      const types = (a.content as { type: string }[]).map((b) => b.type);
      expect(types).not.toContain("thinking");
      expect(types).toContain("tool_use");
    }
  });
});
