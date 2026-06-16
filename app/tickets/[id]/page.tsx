import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ticketTrace } from "@/lib/queries";
import { StatusBadge, PriorityPill, PlanTag } from "@/app/_components/Pills";
import { ApproveButton } from "@/app/_components/ApproveButton";
import { AgentTracePanel } from "@/app/_components/AgentTracePanel";
import { IconArrowLeft, IconDraft, IconCheck, IconWarning } from "@/app/_components/icons";
import { formatUsd, timeAgo, initials, avatarColors } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { customer: true, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) notFound();

  const trace = await ticketTrace(id);

  const customerMsg = ticket.messages.filter((m) => m.role === "CUSTOMER").at(-1);
  const draft = ticket.messages.filter((m) => m.role === "AI" && m.status === "DRAFT").at(-1);
  const sent = ticket.messages.filter((m) => m.role === "AI" && m.status === "SENT").at(-1);
  const escalTeam = ticket.tags.find((t) => t.startsWith("escalated:"))?.split(":")[1];

  const av = avatarColors(ticket.customer.name);

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Breadcrumb */}
        <header className="flex h-[54px] flex-none items-center gap-3 border-b border-border bg-surface px-[22px]">
          <Link href="/" className="flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
            <IconArrowLeft size={15} /> Inbox
          </Link>
          <span className="text-faint">/</span>
          <span className="font-mono text-[11px] text-ink-3">{ticket.id.slice(0, 10)}</span>
          <StatusBadge status={ticket.status} />
        </header>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-6">
          <div className="mx-auto flex max-w-[760px] flex-col gap-[18px]">
            {/* Subject */}
            <div>
              <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">{ticket.subject}</h1>
              <div className="mt-2 flex items-center gap-3">
                <div
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{ background: av.bg, color: av.fg }}
                >
                  {initials(ticket.customer.name)}
                </div>
                <span className="text-[13px] font-medium text-ink">{ticket.customer.name}</span>
                <span className="font-mono text-[11px] text-muted">{ticket.customer.email}</span>
                <PlanTag plan={ticket.customer.plan} />
                <PriorityPill priority={ticket.priority} />
                <span className="text-[12px] text-faint">{timeAgo(ticket.createdAt)}</span>
              </div>
            </div>

            {/* Customer message */}
            {customerMsg && (
              <div className="rounded-[11px] border border-border bg-surface p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[12.5px] font-semibold text-ink">{ticket.customer.name}</span>
                  <span className="font-mono text-[10.5px] text-faint">{timeAgo(customerMsg.createdAt)}</span>
                </div>
                <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{customerMsg.body}</p>
              </div>
            )}

            {/* Outcome */}
            {draft ? (
              <OutcomeCard
                tone="open"
                icon={<IconDraft size={15} />}
                title="Agent draft"
                subtitle="staged for your approval · not yet sent"
                cost={trace.costUsd}
                body={draft.body}
                citations={trace.citations}
                footer={<ApproveButton messageId={draft.id} ticketId={ticket.id} />}
              />
            ) : sent ? (
              <OutcomeCard
                tone="resolved"
                icon={<IconCheck size={15} />}
                title="Sent to customer"
                subtitle="approved & sent"
                cost={trace.costUsd}
                body={sent.body}
                citations={trace.citations}
              />
            ) : ticket.status === "ESCALATED" ? (
              <OutcomeCard
                tone="escal"
                icon={<IconWarning size={15} />}
                title={`Escalated${escalTeam ? ` to ${escalTeam.replace(/_/g, " ")}` : ""}`}
                subtitle="no reply sent"
                cost={trace.costUsd}
                body="The agent escalated this ticket to a human team rather than answering. See the run trace for the reasoning."
              />
            ) : (
              <div className="rounded-[11px] border border-dashed border-border bg-surface px-4 py-6 text-center text-[13px] text-muted">
                No agent run yet — run the agent from the panel to draft a reply.
              </div>
            )}
          </div>
        </div>
      </div>

      <AgentTracePanel ticketId={ticket.id} trace={trace} />
    </div>
  );
}

function OutcomeCard({
  tone,
  icon,
  title,
  subtitle,
  cost,
  body,
  citations,
  footer,
}: {
  tone: "open" | "resolved" | "escal";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  cost: number;
  body: string;
  citations?: { slug: string; title: string }[];
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        borderColor: `var(--${tone})`,
        borderWidth: "1.5px",
        boxShadow: tone === "open" ? "0 4px 16px rgba(47,109,246,0.10)" : undefined,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 border-b px-4 py-2.5"
        style={{ background: `var(--${tone}-bg)`, borderColor: `var(--${tone})` }}
      >
        <span style={{ color: `var(--${tone}-fg)` }}>{icon}</span>
        <div className="flex-1">
          <div className="text-[13px] font-semibold" style={{ color: `var(--${tone}-fg)` }}>
            {title}
          </div>
          <div className="text-[11.5px] opacity-80" style={{ color: `var(--${tone}-fg)` }}>
            {subtitle}
          </div>
        </div>
        <span className="font-mono text-[11px]" style={{ color: `var(--${tone}-fg)` }}>
          {formatUsd(cost)}
        </span>
      </div>

      {/* Body */}
      <div className="bg-surface px-[18px] py-[18px]">
        <p className="whitespace-pre-line text-[13.5px] leading-[1.65] text-ink">{body}</p>
        {citations && citations.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 font-mono text-[9.5px] font-semibold tracking-[0.06em] text-faint">
              GROUNDED IN · CONSULTED DURING THIS RUN
            </div>
            <div className="flex flex-wrap gap-1.5">
              {citations.map((c) => (
                <Link
                  key={c.slug}
                  href={`/kb/${c.slug}`}
                  className="rounded-md bg-inset px-2 py-1 font-mono text-[10.5px] text-ink-3 hover:text-accent-ink"
                >
                  {c.slug}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {footer && (
        <div className="flex items-center gap-2.5 border-t border-border-2 bg-surface-2 px-4 py-[11px]">
          {footer}
          <button
            type="button"
            disabled
            className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] text-muted opacity-60"
            title="Not wired in this build"
          >
            Edit draft
          </button>
        </div>
      )}
    </div>
  );
}
