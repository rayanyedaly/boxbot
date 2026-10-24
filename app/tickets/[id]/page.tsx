import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ticketTrace } from "@/lib/queries";
import { StatusBadge, PriorityPill, PlanTag, DemoTag } from "@/app/_components/Pills";
import { ApproveButton } from "@/app/_components/ApproveButton";
import { AgentTracePanel } from "@/app/_components/AgentTracePanel";
import { ResetTicketButton } from "@/app/_components/ResetTicketButton";
import { demoContext } from "@/lib/demo/context";
import { canSeeTicket } from "@/lib/demo/tickets";
import { IconArrowLeft, IconDraft, IconCheck, IconWarning } from "@/app/_components/icons";
import { formatUsd, timeAgo, initials } from "@/lib/format";
import { PageHeader } from "@/app/_components/PageHeader";
import { SectionLabel } from "@/app/_components/ui";

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
  const demo = await demoContext();
  if (!ticket || !canSeeTicket(ticket, demo?.visitorId ?? null)) notFound();

  const trace = await ticketTrace(id);

  const customerMsg = ticket.messages.filter((m) => m.role === "CUSTOMER").at(-1);
  const draft = ticket.messages.filter((m) => m.role === "AI" && m.status === "DRAFT").at(-1);
  const sent = ticket.messages.filter((m) => m.role === "AI" && m.status === "SENT").at(-1);
  const escalTeam = ticket.tags.find((t) => t.startsWith("escalated:"))?.split(":")[1];
  // Offer a reset once the agent has touched the ticket (a draft, a reply, or a status change).
  const seed = ticket.seedState as { status?: string } | null;
  const canReset = !!seed && (draft !== undefined || sent !== undefined || seed.status !== ticket.status);

  return (
    <div className="flex flex-col lg:h-full lg:flex-row">
      <div className="flex min-w-0 flex-col lg:flex-1">
        {/* Breadcrumb (the agent panel holds the theme toggle in the top-right corner) */}
        <PageHeader themeToggle={false} actions={canReset && <ResetTicketButton ticketId={ticket.id} />}>
          <Link href="/" className="flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
            <IconArrowLeft size={15} /> Inbox
          </Link>
          <span className="hidden text-faint sm:inline">/</span>
          <span className="hidden font-mono text-xs text-muted sm:inline">{ticket.id.slice(0, 10)}</span>
          <StatusBadge status={ticket.status} />
          {ticket.visitorId && <DemoTag label="Yours" />}
        </PageHeader>

        {/* Content */}
        <div className="px-4 py-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-6 lg:py-6">
          <div className="mx-auto flex max-w-[760px] flex-col gap-5">
            {/* Subject */}
            <div>
              <h1 className="text-xl font-semibold text-ink">{ticket.subject}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-2xs font-semibold text-ink-3">
                  {initials(ticket.customer.name)}
                </div>
                <span className="text-sm font-medium text-ink">{ticket.customer.name}</span>
                <span className="hidden text-xs text-muted sm:inline">{ticket.customer.email}</span>
                <PlanTag plan={ticket.customer.plan} />
                <PriorityPill priority={ticket.priority} />
                <span className="text-xs text-muted">{timeAgo(ticket.createdAt)}</span>
              </div>
            </div>

            {/* Customer message */}
            {customerMsg && (
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{ticket.customer.name}</span>
                  <span className="text-xs text-muted">{timeAgo(customerMsg.createdAt)}</span>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">{customerMsg.body}</p>
              </div>
            )}

            {/* Outcome */}
            <div data-tour="outcome">
            {draft ? (
              <OutcomeCard
                tone="open"
                icon={<IconDraft size={15} />}
                title="Agent draft"
                subtitle="Waiting for your approval. Not sent yet."
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
                subtitle="Approved and sent"
                cost={trace.costUsd}
                body={sent.body}
                citations={trace.citations}
              />
            ) : ticket.status === "ESCALATED" ? (
              <OutcomeCard
                tone="escal"
                icon={<IconWarning size={15} />}
                title={`Escalated${escalTeam ? ` to ${escalTeam.replace(/_/g, " ")}` : ""}`}
                subtitle="No reply sent"
                cost={trace.costUsd}
                body="The agent escalated this ticket to a human team rather than answering. See the run trace for the reasoning."
              />
            ) : (
              <div className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
                No agent run yet. Run the agent from the panel to draft a reply.
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      <AgentTracePanel ticketId={ticket.id} trace={trace} quota={demo?.quota ?? null} />
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
    // A pending draft gets the tone-colored border so it stands out; settled outcomes stay neutral.
    <div
      className="overflow-hidden rounded-lg border bg-surface"
      style={{ borderColor: tone === "open" ? `var(--${tone})` : "var(--border)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border-2 px-4 py-2.5">
        <span style={{ color: `var(--${tone}-fg)` }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold" style={{ color: `var(--${tone}-fg)` }}>
            {title}
          </div>
          <div className="text-xs text-muted">{subtitle}</div>
        </div>
        <span className="font-mono text-xs text-muted">{formatUsd(cost)}</span>
      </div>

      {/* Body */}
      <div className="px-4 py-4 sm:px-5">
        <p className="whitespace-pre-line text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">{body}</p>
        {citations && citations.length > 0 && (
          <div className="mt-4">
            <SectionLabel className="mb-1.5">Knowledge base articles used in this run</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {citations.map((c) => (
                <Link
                  key={c.slug}
                  href={`/kb/${c.slug}`}
                  className="rounded-sm border border-border px-1.5 py-1 font-mono text-2xs text-ink-3 hover:border-accent-bd hover:text-accent-ink"
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
        <div className="flex flex-wrap items-center gap-2.5 border-t border-border-2 px-4 py-3">{footer}</div>
      )}
    </div>
  );
}
