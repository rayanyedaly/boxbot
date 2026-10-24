// app/_components/ResetTicketButton.tsx
"use client";

import { useState, useTransition } from "react";
import { resetTicketAction } from "@/app/actions/demo";
import { buttonClass } from "./ui";

/** Puts the ticket back as it was seeded, so the next visitor (or you) can run it fresh. Free: no model calls. */
export function ResetTicketButton({ ticketId }: { ticketId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-xs text-[color:var(--escal-fg)]">
          {error}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await resetTicketAction(ticketId);
            if (!res.ok) setError(res.message ?? "Couldn't reset this ticket.");
          })
        }
        className={`${buttonClass("secondary")} px-2.5 py-1 text-xs`}
        title="Remove the agent's draft and restore the ticket's original status"
      >
        {pending ? "Resetting…" : "Reset ticket"}
      </button>
    </span>
  );
}
