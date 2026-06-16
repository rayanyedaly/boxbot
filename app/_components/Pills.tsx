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
  URGENT: "--escal",
  HIGH: "--pending",
  MEDIUM: "--accent",
  LOW: "--muted",
};

/** Dot + colored label badge (the primary status indicator). */
export function StatusBadge({ status }: { status: string }) {
  const t = STATUS_TOKEN[status] ?? "open";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: `var(--${t})` }} />
      <span
        className="rounded-[5px] px-2 py-0.5 text-[12px] font-semibold"
        style={{ color: `var(--${t}-fg)`, background: `var(--${t}-bg)` }}
      >
        {STATUS_LABEL[status] ?? status}
      </span>
    </span>
  );
}

/** Label-only status pill (no dot) — for tight spots. */
export function StatusPill({ status }: { status: string }) {
  const t = STATUS_TOKEN[status] ?? "open";
  return (
    <span
      className="inline-flex items-center rounded-[5px] px-2 py-0.5 text-[12px] font-semibold"
      style={{ color: `var(--${t}-fg)`, background: `var(--${t}-bg)` }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Vertical priority bar + label (design style). */
export function PriorityPill({ priority }: { priority: string }) {
  const v = PRIORITY_VAR[priority] ?? "--muted";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-1 rounded-[2px]" style={{ background: `var(${v})` }} />
      <span className="font-mono text-[10px] font-semibold" style={{ color: `var(${v})` }}>
        {priority.charAt(0) + priority.slice(1).toLowerCase()}
      </span>
    </span>
  );
}

export function ChannelTag({ channel }: { channel: string }) {
  return <span className="font-mono text-[10.5px] text-faint">{channel.toLowerCase()}</span>;
}

export function PlanTag({ plan }: { plan: string }) {
  return (
    <span className="rounded-[4px] border border-border px-1.5 py-px text-[10.5px] font-medium text-faint">
      {plan}
    </span>
  );
}
