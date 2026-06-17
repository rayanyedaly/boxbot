// app/_components/ApproveButton.tsx
"use client";

import { useTransition } from "react";
import { approveMessage } from "@/app/actions/messages";
import { IconCheck } from "./icons";

export function ApproveButton({
  messageId,
  ticketId,
}: {
  messageId: string;
  ticketId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => approveMessage(messageId, ticketId))}
      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-on-accent shadow-[0_1px_2px_rgba(47,109,246,0.35)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        "Approving…"
      ) : (
        <>
          <IconCheck size={14} /> Approve &amp; send
        </>
      )}
    </button>
  );
}
