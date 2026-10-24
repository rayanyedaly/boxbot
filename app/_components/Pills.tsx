// app/_components/Pills.tsx
//
// Token-based status / priority / channel / plan indicators. Colors are applied via
// inline style var(--token) because the family is chosen dynamically from the enum,
// and the vars re-resolve on theme switch.

const STATUS_TOKEN: Record<string, string> = {
  OPEN: "open",
  PENDING: "pending",
  RESOLVED: "resolved",
  ESCALATED: "escal",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  PENDING: "Pending",
  RESOLVED: "Resolved",
  ESCALATED: "Escalated",
};

const PRIORITY_VAR: Record<string, string> = {
  URGENT: "--escal-fg",
  HIGH: "--pending-fg",
  MEDIUM: "--ink-3",
  LOW: "--muted",
};

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Dot + colored label (the primary status indicator). */
export function StatusBadge({ status }: { status: string }) {
  const t = STATUS_TOKEN[status] ?? "open";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: `var(--${t}-fg)` }}>
      <span className="h-2 w-2 flex-none rounded-full" style={{ background: `var(--${t})` }} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Smaller dot + label, for table cells. */
export function StatusPill({ status }: { status: string }) {
  const t = STATUS_TOKEN[status] ?? "open";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: `var(--${t}-fg)` }}>
      <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: `var(--${t})` }} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Priority as colored text; low priority stays quiet. */
export function PriorityPill({ priority }: { priority: string }) {
  const v = PRIORITY_VAR[priority] ?? "--muted";
  return (
    <span className="text-xs font-medium" style={{ color: `var(${v})` }}>
      {title(priority)}
    </span>
  );
}

const CHANNEL_LABEL: Record<string, string> = { EMAIL: "Email", CHAT: "Chat", WHATSAPP: "WhatsApp", WEB: "Web" };

export function ChannelTag({ channel }: { channel: string }) {
  return <span className="text-xs text-muted">{CHANNEL_LABEL[channel] ?? title(channel)}</span>;
}

export function PlanTag({ plan }: { plan: string }) {
  return <span className="text-xs text-muted">{title(plan)}</span>;
}

/** Public-demo marker: solid for "start here", outlined for "yours". */
export function DemoTag({ label, solid = false }: { label: string; solid?: boolean }) {
  return (
    <span
      className={`rounded-sm px-1.5 text-2xs font-medium ${
        solid ? "bg-accent text-on-accent" : "border border-accent-bd text-accent-ink"
      }`}
    >
      {label}
    </span>
  );
}
