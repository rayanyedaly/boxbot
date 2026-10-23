// app/actions/demo.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { demoEnabled } from "@/lib/demo/config";
import { ensureVisitor, readVisitorId, saveVisitorProfile } from "@/lib/demo/visitor";
import { createVisitorTicket, resetTicket } from "@/lib/demo/tickets";

/** Optional name/company from the welcome card. No-op outside the public demo. */
export async function saveProfile(name: string, company: string): Promise<void> {
  if (!demoEnabled()) return;
  await saveVisitorProfile(name, company);
}

export async function resetTicketAction(ticketId: string): Promise<{ ok: boolean; message?: string }> {
  const visitorId = demoEnabled() ? await readVisitorId() : null;
  const res = await resetTicket(ticketId, visitorId);
  if (!res.ok) return res;
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/");
  return { ok: true };
}

export type NewTicketState = { error?: string; values?: Record<string, string> };

export async function createTicketAction(_prev: NewTicketState, form: FormData): Promise<NewTicketState> {
  const values = {
    customerId: String(form.get("customerId") ?? ""),
    guestName: String(form.get("guestName") ?? ""),
    subject: String(form.get("subject") ?? ""),
    body: String(form.get("body") ?? ""),
  };
  const visitor = demoEnabled() ? await ensureVisitor() : null;
  const res = await createVisitorTicket(values, visitor);
  if (!res.ok) return { error: res.message, values };
  revalidatePath("/");
  redirect(`/tickets/${res.ticketId}`);
}
