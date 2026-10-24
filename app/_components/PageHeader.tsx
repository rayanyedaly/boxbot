// app/_components/PageHeader.tsx
//
// The bar at the top of every page: page-specific content on the left, actions on the
// right, and the theme toggle in the top-right corner from lg up (below lg the
// AppShell top bar carries it).

import { ThemeToggle } from "./ThemeToggle";

export function PageHeader({
  children,
  actions,
  sticky = false,
  themeToggle = true,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
  sticky?: boolean;
  /** Off where something else owns the top-right corner (the ticket page's agent panel). */
  themeToggle?: boolean;
}) {
  return (
    <header
      className={`${sticky ? "sticky top-0 z-10 " : ""}flex h-14 flex-none items-center gap-3 border-b border-border bg-surface px-4 md:px-6`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      {actions}
      {themeToggle && <ThemeToggle className="hidden h-8 w-8 lg:flex" />}
    </header>
  );
}
