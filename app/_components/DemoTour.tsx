// app/_components/DemoTour.tsx
"use client";

// The public demo's 30-second guided tour. A welcome card (optional name/company), then
// driver.js spotlights across two pages: the inbox (open the featured ticket) and a
// ticket (run the agent, watch the trace, see the staged draft, the dashboard, and
// "write your own"). Progress lives in localStorage so a page change resumes it; the
// run steps advance on the agent panel's run events, not on a timer.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type Driver, type DriveStep, type Popover } from "driver.js";
import "driver.js/dist/driver.css";
import { REPLAY_EVENT, RUN_EVENT, type RunPhase } from "@/lib/demo/events";
import { saveProfile } from "@/app/actions/demo";
import { BrandMark } from "./BrandMark";

type Stage = "welcome" | "inbox" | "ticket" | "done";

const KEY = "bb_tour_v1";

function readStage(): Stage {
  try {
    const v = localStorage.getItem(KEY);
    return v === "inbox" || v === "ticket" || v === "done" ? v : "welcome";
  } catch {
    return "done"; // storage blocked (private mode, previews): don't nag on every page
  }
}
// localStorage as a tiny external store, so every page view reads the same stage.
const listeners = new Set<() => void>();
let memoryStage: Stage | null = null; // fallback when storage is blocked

function setStage(s: Stage) {
  memoryStage = s;
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* tour still works for this page view */
  }
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
const getStage = () => memoryStage ?? readStage();

const desc = (step: string, body: string, hint?: string) =>
  `<span class="bb-tour-step">${step}</span>${body}${hint ? `<span class="bb-tour-hint">${hint}</span>` : ""}`;

// The first element with this tour name that's on screen. Some targets exist twice:
// "new-ticket" is in the sidebar (a hidden drawer on phones) and in the phone top bar
// (display:none on desktop).
const shown = (e: Element) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
const find = (name: string) => [...document.querySelectorAll(`[data-tour="${name}"]`)].find(shown);

type TourStep = { name: string; title: string; body: string; hint?: string; popover?: Partial<Popover> };

// Numbered after filtering, so a step that's hidden at this size doesn't leave a gap.
const toDriverSteps = (steps: TourStep[], first: number, total: number): DriveStep[] =>
  steps.map((st, i) => ({
    element: () => find(st.name) as Element,
    popover: { title: st.title, description: desc(`${first + i} / ${total}`, st.body, st.hint), ...st.popover },
  }));

export function DemoTour({ runsLimit, model }: { runsLimit: number; model: string }) {
  const pathname = usePathname();
  const router = useRouter();
  // Null on the server and during hydration, so the welcome card never flashes in SSR HTML.
  const stage = useSyncExternalStore<Stage | null>(subscribe, getStage, () => null);
  const driverRef = useRef<Driver | null>(null);
  const prevPath = useRef<string | null>(null);
  const stepNames = useRef<string[]>([]); // the active steps, so run events move by name

  // "Replay tour" from the sidebar.
  useEffect(() => {
    const replay = () => {
      setStage("inbox");
      if (pathname !== "/") router.push("/");
    };
    window.addEventListener(REPLAY_EVENT, replay);
    return () => window.removeEventListener(REPLAY_EVENT, replay);
  }, [pathname, router]);

  // Drive the spotlight steps for the current page.
  useEffect(() => {
    const from = prevPath.current;
    prevPath.current = pathname;
    if (stage !== "inbox" && stage !== "ticket") return;
    const onInbox = pathname === "/";
    const onTicket = /^\/tickets\/(?!new$)[^/]+$/.test(pathname);
    // Opening a ticket from the inbox step moves the tour on. (Starting or replaying the
    // tour from a ticket page sends the visitor to the inbox first; that isn't it.)
    if (stage === "inbox" && onTicket) return from === "/" ? setStage("ticket") : undefined;
    // Leaving the ticket mid-tour ends it, rather than resuming later on some other ticket.
    if (stage === "ticket" && !onTicket) return setStage("done");
    if ((stage === "inbox" && !onInbox) || (stage === "ticket" && !onTicket)) return;

    const end = () => {
      setStage("done");
      driverRef.current?.destroy();
    };

    // Phones (below lg) stack the agent panel under the ticket and keep the sidebar in a
    // drawer, so popovers sit above/below, and the dashboard step (a sidebar link) drops.
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const tap = window.matchMedia("(pointer: coarse)").matches ? "Tap" : "Click";

    const ticketTour: TourStep[] = [
      {
        name: "run-agent",
        title: "Run the agent",
        body: `This is live: <strong>${model}</strong> with eight tools over this app's database. A run takes about 8 seconds and costs about 2¢.`,
        hint: `${tap} Run agent`,
        popover: {
          side: "top",
          align: "end",
          showButtons: ["next", "close"],
          nextBtnText: "Skip",
          popoverClass: "bb-tour bb-tour-gated",
        },
      },
      {
        name: "trace",
        title: "Watch it work",
        body: "Each tool call streams in with its arguments and result, and every model call shows its cost. Nothing here is scripted.",
        hint: "The tour continues when the run finishes",
        popover: {
          side: wide ? "left" : "top",
          align: wide ? "center" : "start",
          showButtons: ["next", "close"],
          nextBtnText: "Skip",
          popoverClass: "bb-tour bb-tour-gated",
        },
      },
      {
        name: "outcome",
        title: "A draft, never a sent email",
        body: "The agent <strong>stages</strong> its reply. Nothing reaches the customer until a person clicks Approve. When policy says a human should decide, it escalates instead. <strong>Reset ticket</strong> puts it back for the next run.",
        popover: { side: "bottom", align: "start", showButtons: ["next", "close"] },
      },
      {
        name: "nav-dashboard",
        title: "Every model call is logged",
        body: "Tokens, cost and latency for each call, rolled up per ticket and per day. The eval suite and its pass rates are in the README.",
        popover: { side: "right", align: "start", showButtons: ["next", "close"] },
      },
      {
        name: "new-ticket",
        title: "Now try your own",
        body: `Write any support request: a refund, an angry complaint, or a prompt injection. Then run the agent on it. You have <strong>${runsLimit} runs</strong> per 24 hours.`,
        popover: {
          side: wide ? "right" : "bottom",
          align: "end",
          showButtons: ["next", "close"],
          doneBtnText: "Finish",
          onNextClick: end,
        },
      },
    ].filter((st) => find(st.name)) as TourStep[];

    const total = 1 + (onTicket ? ticketTour.length : wide ? 5 : 4);
    const steps = onInbox
      ? toDriverSteps(
          [
            {
              name: "featured-ticket",
              title: "Start with a real ticket",
              body: "Maya is chasing a refund. Answering her means looking up her account, her orders and the refund policy, so the agent has to chain several tools.",
              hint: `${tap} the ticket to open it`,
              popover: { side: "bottom", align: "center", showButtons: ["close"] },
            },
          ],
          1,
          total,
        )
      : toDriverSteps(ticketTour, 2, total);
    stepNames.current = onInbox ? ["featured-ticket"] : ticketTour.map((st) => st.name);

    const d = driver({
      steps,
      animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      overlayColor: "#080c18",
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 10,
      popoverClass: "bb-tour",
      overlayClickBehavior: "none",
      allowKeyboardControl: false, // arrow keys would skip the "click this" steps (Escape: see below)
      onDestroyStarted: end, // the close button and Escape end the tour for good
    });
    driverRef.current = d;
    // Let the page paint before measuring the element.
    const t = window.setTimeout(() => d.drive(), 250);
    // Keyboard control is off (arrows would skip steps), which also drops driver's
    // Escape handling; Escape still ends the tour.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && d.isActive()) end();
    };
    window.addEventListener("keydown", onKey);
    // driver.js tracks window scroll only, but the page scrolls inside <main> (and on
    // phones the trace grows as the run streams), so re-measure on both.
    const refresh = () => d.isActive() && d.refresh();
    const scroller = document.querySelector("main");
    scroller?.addEventListener("scroll", refresh, { passive: true });
    const grows = new ResizeObserver(refresh);
    for (const st of steps) {
      const target = typeof st.element === "function" ? st.element() : null;
      if (target) grows.observe(target);
    }

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      scroller?.removeEventListener("scroll", refresh);
      grows.disconnect();
      d.destroy();
      if (driverRef.current === d) driverRef.current = null;
    };
  }, [stage, pathname, runsLimit, model]);

  // Run steps follow the agent panel: start → trace, page refreshed with the result → outcome.
  useEffect(() => {
    const onRun = (e: Event) => {
      const d = driverRef.current;
      if (!d?.isActive()) return;
      const { phase, ok } = (e as CustomEvent<{ phase: RunPhase; ok: boolean }>).detail;
      const names = stepNames.current;
      const i = d.getActiveIndex() ?? -1;
      const at = (name: string) => names.indexOf(name);
      if (phase === "start" && i === at("run-agent") && at("trace") >= 0) d.moveTo(at("trace"));
      // A failed run leaves the tour on the trace, where the error is shown.
      if (phase === "refreshed" && ok && at("outcome") >= 0 && (i === at("run-agent") || i === at("trace")))
        window.setTimeout(() => d.moveTo(at("outcome")), 200);
    };
    window.addEventListener(RUN_EVENT, onRun);
    return () => window.removeEventListener(RUN_EVENT, onRun);
  }, []);

  if (stage !== "welcome") return null;
  return (
    <WelcomeCard
      runsLimit={runsLimit}
      onStart={(name, company) => {
        if (name || company) saveProfile(name, company).catch(() => {});
        setStage("inbox");
        if (pathname !== "/") router.push("/");
      }}
      onSkip={() => setStage("done")}
    />
  );
}

function WelcomeCard({
  runsLimit,
  onStart,
  onSkip,
}: {
  runsLimit: number;
  onStart: (name: string, company: string) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  const onSkipRef = useRef(onSkip);
  useEffect(() => {
    onSkipRef.current = onSkip;
  });

  // A native modal dialog: focus trap, inert page behind it, Escape (cancel) for free.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const cancel = (e: Event) => {
      e.preventDefault();
      onSkipRef.current();
    };
    d.addEventListener("cancel", cancel);
    if (!d.open) d.showModal();
    return () => {
      d.removeEventListener("cancel", cancel);
      if (d.open) d.close();
    };
  }, []);

  const input =
    "h-9 rounded-lg border border-border bg-inset px-2.5 text-[13px] text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";

  return (
    <dialog
      ref={ref}
      aria-labelledby="bb-welcome-title"
      className="m-auto w-[calc(100%-32px)] max-w-[440px] rounded-2xl border border-border bg-surface p-6 text-ink shadow-[0_24px_64px_rgba(8,12,24,0.35)] backdrop:bg-[#080c18]/55"
    >
      <div className="flex items-center gap-2.5">
        <BrandMark />
        <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-accent-ink">LIVE DEMO</span>
      </div>
      <h2 id="bb-welcome-title" className="mt-4 text-[20px] font-semibold tracking-[-0.02em] text-ink">
        Meet BoxBot, an AI support agent
      </h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
        It reads a support ticket, looks things up with its own tools (customers, orders, the knowledge base), and
        stages a reply that a person approves. Every model call is logged with its cost.
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
        The tour takes 30 seconds. You get {runsLimit} live agent runs per 24 hours.
      </p>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          onStart(name.trim(), company.trim());
        }}
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11.5px] font-medium text-ink-3">
            <span className="flex items-baseline justify-between">
              Your name <span className="font-normal text-muted">optional</span>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] font-medium text-ink-3">
            <span className="flex items-baseline justify-between">
              Company <span className="font-normal text-muted">optional</span>
            </span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              maxLength={80}
              autoComplete="organization"
              className={input}
            />
          </label>
        </div>
        <p className="mt-2 text-[11.5px] text-ink-3">Only used to count who tried the demo. No account, no email.</p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-ink-3 hover:bg-inset hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            Skip, I&apos;ll explore
          </button>
          <button
            type="submit"
            autoFocus
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Start the tour
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** Sidebar link that restarts the tour from the inbox. */
export function ReplayTourButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(REPLAY_EVENT))}
      className="text-[11.5px] font-medium text-accent-ink hover:underline"
    >
      Replay tour
    </button>
  );
}
