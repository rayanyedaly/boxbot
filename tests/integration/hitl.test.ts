import { describe, it, expect, beforeAll, vi } from "vitest";

// approveMessage calls revalidatePath, which throws outside a Next request scope.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { runTool } from "../../lib/agent/tools";
import { approveMessage } from "../../app/actions/messages";
import { prisma } from "../../lib/prisma";

let ticketId: string;
let customerMsgId: string;
let draftId: string;

beforeAll(async () => {
  const ticket = await prisma.ticket.findFirst({
    where: { subject: { contains: "refund", mode: "insensitive" } },
    include: { messages: { where: { role: "CUSTOMER" }, take: 1 } },
  });
  if (!ticket) throw new Error("seed missing the refund ticket");
  ticketId = ticket.id;
  customerMsgId = ticket.messages[0].id;
});

describe("human-in-the-loop draft → approve", () => {
  it("draft_reply stages a DRAFT message (never SENT)", async () => {
    const res = (await runTool("draft_reply", {
      ticketId,
      body: "Hi Maya — looking into your refund now.",
    })) as { draftId: string; status: string; staged: boolean };

    expect(res.status).toBe("DRAFT");
    expect(res.staged).toBe(true);
    draftId = res.draftId;

    const row = await prisma.message.findUnique({ where: { id: draftId } });
    expect(row?.role).toBe("AI");
    expect(row?.status).toBe("DRAFT");
  });

  it("approveMessage flips the AI DRAFT to SENT and revalidates", async () => {
    await approveMessage(draftId, ticketId);

    const row = await prisma.message.findUnique({ where: { id: draftId } });
    expect(row?.status).toBe("SENT");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(`/tickets/${ticketId}`);
  });

  it("approveMessage is scoped — it won't flip a non-AI / non-DRAFT message", async () => {
    const before = await prisma.message.findUnique({ where: { id: customerMsgId } });
    expect(before?.role).toBe("CUSTOMER");

    await approveMessage(customerMsgId, ticketId);

    const after = await prisma.message.findUnique({ where: { id: customerMsgId } });
    expect(after?.role).toBe("CUSTOMER");
    expect(after?.status).toBe(before?.status); // unchanged
  });
});
