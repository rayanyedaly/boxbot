// app/actions/messages.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * The human-in-the-loop gate: approve a staged AI draft by flipping it DRAFT -> SENT.
 * This is the ONLY transition to SENT and the only "send" in the system — there is no
 * real outbound delivery. Ticket status is left to the agent's own tools. Idempotent.
 */
export async function approveMessage(
  messageId: string,
  ticketId: string,
): Promise<void> {
  // Scope the transition so only an AI DRAFT on this ticket can flip to SENT — a
  // data-integrity guard (updateMany is a clean no-op on re-approve, never a throw).
  await prisma.message.updateMany({
    where: { id: messageId, ticketId, role: "AI", status: "DRAFT" },
    data: { status: "SENT" },
  });
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/");
  revalidatePath("/dashboard");
}
