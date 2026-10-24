// app/_components/ThemeToggle.tsx
"use client";

import { useSyncExternalStore } from "react";
import { IconSun, IconMoon } from "./icons";

type Theme = "light" | "dark";

// Read the theme straight from <html data-theme> (set pre-paint by the no-flash
// script). useSyncExternalStore avoids setState-in-effect and handles SSR cleanly.
function subscribe(cb: () => void) {
  window.addEventListener("themechange", cb);
  return () => window.removeEventListener("themechange", cb);
}
function getSnapshot(): Theme {
  return (document.documentElement.dataset.theme as Theme) === "dark" ? "dark" : "light";
}
function getServerSnapshot(): Theme {
  return "light";
}

function apply(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    /* storage unavailable — toggle still works for the session */
  }
  window.dispatchEvent(new Event("themechange"));
}

/** One icon button that flips light/dark. Both icons are rendered and picked by CSS
 *  (`dark:` follows <html data-theme>), so the right one shows before hydration.
 *  `className` sets display + size, e.g. "hidden h-8 w-8 lg:flex" for desktop only. */
export function ThemeToggle({ className = "flex h-8 w-8" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={() => apply(theme === "dark" ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={`flex-none items-center justify-center rounded-md text-ink-3 transition hover:bg-inset hover:text-ink focus-visible:outline-2 focus-visible:outline-accent ${className}`}
    >
      <IconMoon size={16} className="dark:hidden" />
      <IconSun size={16} className="hidden dark:block" />
    </button>
  );
}
