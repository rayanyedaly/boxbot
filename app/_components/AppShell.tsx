// app/_components/AppShell.tsx
"use client";

// The responsive frame around every page. From lg up, the sidebar sits beside the
// page as before. Below lg it becomes a modal drawer behind a top bar (menu, brand,
// new ticket), so phones get the full width for the inbox and tickets.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { REPLAY_EVENT } from "@/lib/demo/events";
import { BrandMark } from "./BrandMark";
import { IconClose, IconMenu, IconPlus } from "./icons";

export function AppShell({
  sidebar,
  demo,
  children,
}: {
  sidebar: React.ReactNode;
  /** Public demo: the "new ticket" button gets the highlight it has on desktop. */
  demo: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const refocusMenu = useRef(false);

  // Any navigation closes the drawer, not only link taps (back button, router.push).
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setOpen(false);
  }

  // Escape, the backdrop and the close button hand focus back to the menu button,
  // once the drawer has closed (until then the top bar is inert and can't take it).
  const dismiss = () => {
    refocusMenu.current = true;
    setOpen(false);
  };

  useEffect(() => {
    if (!open) {
      if (refocusMenu.current) menuRef.current?.focus();
      refocusMenu.current = false;
      return;
    }
    closeRef.current?.focus(); // move focus into the drawer
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      refocusMenu.current = true;
      setOpen(false);
    };
    // Replaying the tour from the drawer needs the page, and growing to desktop
    // width makes the drawer the static sidebar again.
    const close = () => setOpen(false);
    const desktop = window.matchMedia("(min-width: 1024px)");
    window.addEventListener("keydown", onKey);
    window.addEventListener(REPLAY_EVENT, close);
    desktop.addEventListener("change", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(REPLAY_EVENT, close);
      desktop.removeEventListener("change", close);
    };
  }, [open]);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Mobile top bar (inert behind the open drawer) */}
      <header
        inert={open}
        className="flex h-14 flex-none items-center gap-3 border-b border-border bg-surface px-3 lg:hidden"
      >
        <button
          ref={menuRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="app-sidebar"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-3 hover:bg-inset hover:text-ink"
        >
          <IconMenu size={20} />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">BoxBot</span>
        </Link>
        <span className="flex-1" />
        <Link
          href="/tickets/new"
          data-tour="new-ticket"
          className={`${demo ? "demo-glow " : ""}flex h-10 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-semibold text-on-accent`}
        >
          <IconPlus size={15} /> New<span className="sr-only"> ticket</span>
        </Link>
      </header>

      {/* Drawer backdrop (mobile) */}
      {open && (
        <div aria-hidden onClick={dismiss} className="fixed inset-0 z-40 bg-[#080c18]/55 lg:hidden" />
      )}

      {/* Sidebar: static from lg; a modal drawer below. Closed, it's invisible, so it's
          out of the tab order too. Opening shows it at once (so focus can move in);
          closing hides it after the slide. Tailwind v4 moves it with `translate`. */}
      <div
        id="app-sidebar"
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Menu" : undefined}
        className={`fixed inset-y-0 left-0 z-50 flex motion-reduce:transition-none lg:static lg:visible lg:z-auto lg:translate-x-0 lg:shadow-none lg:transition-none ${
          open
            ? "visible translate-x-0 shadow-[0_24px_64px_rgba(8,12,24,0.35)] [transition:translate_200ms]"
            : "invisible -translate-x-full [transition:translate_200ms,visibility_0s_200ms]"
        }`}
      >
        {open && (
          <button
            ref={closeRef}
            type="button"
            onClick={dismiss}
            aria-label="Close menu"
            className="absolute right-2 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-lg text-ink-3 hover:bg-inset lg:hidden"
          >
            <IconClose size={18} />
          </button>
        )}
        {sidebar}
      </div>

      <main inert={open} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
