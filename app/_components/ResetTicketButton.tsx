// app/_components/ResetTicketButton.tsx
"use client";

import { useState, useTransition } from "react";
import { resetTicketAction } from "@/app/actions/demo";

/** Puts the ticket back as it was seeded, so the next visitor (or you) can run it fresh. Free: no model calls. */
export function ResetTicketButton({ ticketId }: { ticketId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-[11.5px] text-[color:var(--escal-fg)]">
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
        className="rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-ink-3 transition hover:bg-inset hover:text-ink disabled:opacity-60"
        title="Remove the agent's draft and restore the ticket's original status"
      >
        {pending ? "Resetting…" : "Reset ticket"}
      </button>
    </span>
  );
}
