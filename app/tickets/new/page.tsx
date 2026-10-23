import Link from "next/link";
import { personas } from "@/lib/demo/tickets";
import { demoContext } from "@/lib/demo/context";
import { TICKET_LIMITS } from "@/lib/demo/config";
import { IconArrowLeft } from "@/app/_components/icons";
import { NewTicketForm } from "./NewTicketForm";

export const dynamic = "force-dynamic";

export default async function NewTicketPage() {
  const [people, demo] = await Promise.all([personas(), demoContext()]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[54px] flex-none items-center gap-3 border-b border-border bg-surface px-4 lg:px-[22px]">
        <Link href="/" className="flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
          <IconArrowLeft size={15} /> Inbox
        </Link>
        <span className="text-faint">/</span>
        <span className="text-[13px] font-medium text-ink">New ticket</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-[26px] lg:py-6">
        <div className="mx-auto max-w-[680px]">
          <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">Write your own ticket</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
            Write as one of the demo customers (their orders and ticket history are real data the agent can look
            up) or as a new customer. Then run the agent on it. Try a refund, a vague complaint, or a prompt
            injection.
          </p>
          {demo && (
            <p className="mt-1.5 text-[12px] text-ink-3">
              Only you can see tickets you write. Demo data resets nightly.
            </p>
          )}
          <NewTicketForm
            personas={people.map((p) => ({ id: p.id, label: `${p.name} · ${p.plan} · ${p.orders} order${p.orders === 1 ? "" : "s"}` }))}
            limits={TICKET_LIMITS}
          />
        </div>
      </div>
    </div>
  );
}
