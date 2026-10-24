// app/_components/ApproveButton.tsx
"use client";

import { useTransition } from "react";
import { approveMessage } from "@/app/actions/messages";
import { IconCheck } from "./icons";
import { buttonClass } from "./ui";

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
      className={`${buttonClass()} px-3 py-1.5 text-sm`}
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
