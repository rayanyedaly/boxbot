// app/api/tickets/[id]/run/route.ts
//
// Streams a live agent run to the browser as NDJSON (one JSON object per line).
// A POST can't use SSE/EventSource, and running the agent is a billed mutation, so
// the client reads response.body.getReader() directly. Each AgentEvent from the loop
// is enqueued the moment it fires; a terminal {type:"done"} carries the run summary.

//
// In DEMO_MODE the run is admitted first (per-visitor/IP limits, spend caps, one live
// run per ticket — see lib/demo/runs.ts); a refusal is a plain JSON error, not a stream.

import { runTicket } from "@/lib/agent/loop";
import { prisma } from "@/lib/prisma";
import { demoEnabled } from "@/lib/demo/config";
import { ensureVisitor } from "@/lib/demo/visitor";
import { admitRun, finishRun } from "@/lib/demo/runs";
import { canSeeTicket } from "@/lib/demo/tickets";

// Prisma engine + Anthropic Node streaming need the Node runtime; never cache a billed POST.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let runId: string | null = null;
  if (demoEnabled()) {
    const notFound = () => Response.json({ error: "not_found", message: "Ticket not found." }, { status: 404 });
    try {
      // Look the ticket up before minting a visitor, so junk ids don't create rows.
      const ticket = await prisma.ticket.findUnique({ where: { id }, select: { visitorId: true } });
      if (!ticket) return notFound();
      const visitor = await ensureVisitor();
      if (!canSeeTicket(ticket, visitor.id)) return notFound();
      const admitted = await admitRun(visitor, id);
      if (!admitted.ok) {
        return Response.json({ error: admitted.code, message: admitted.message }, { status: admitted.status });
      }
      runId = admitted.runId;
    } catch (err) {
      // e.g. the DB or the admission transaction timing out: refuse, never run unadmitted.
      console.error("[demo] admission failed", err);
      return Response.json({ error: "busy", message: "The demo is busy. Try again in a few seconds." }, { status: 503 });
    }
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      let ok = false;
      // What this run's model calls cost, as they report it; the result's total (which
      // also counts compaction summaries) replaces it when the run completes.
      let costUsd = 0;
      try {
        const result = await runTicket(id, (e) => {
          if (e.type === "llm_call") costUsd += e.costUsd;
          send(e);
        });
        ok = true;
        costUsd = result.totalCostUsd;
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
        // Settle before closing: the client refreshes on close and reads the quota.
        if (runId) await finishRun(runId, ok, costUsd).catch((e) => console.error("[demo] finishRun failed", e));
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
