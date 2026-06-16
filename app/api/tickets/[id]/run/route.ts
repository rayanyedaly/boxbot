// app/api/tickets/[id]/run/route.ts
//
// Streams a live agent run to the browser as NDJSON (one JSON object per line).
// A POST can't use SSE/EventSource, and running the agent is a billed mutation, so
// the client reads response.body.getReader() directly. Each AgentEvent from the loop
// is enqueued the moment it fires; a terminal {type:"done"} carries the run summary.

import { runTicket } from "@/lib/agent/loop";

// Prisma engine + Anthropic Node streaming need the Node runtime; never cache a billed POST.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        const result = await runTicket(id, (e) => send(e));
        send({
          type: "done",
          stopReason: result.stopReason,
          toolCalls: result.toolCalls.map((t) => t.name),
          llmCalls: result.llmCalls,
          totalCostUsd: result.totalCostUsd,
          compactions: result.compactions,
          tokensSaved: result.tokensSaved,
          hitIterationCap: result.hitIterationCap,
        });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      // Client disconnected. The loop has no abort hook, so an in-flight model call
      // still completes and still logs its LlmCall — acceptable for this app.
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
    },
  });
}
