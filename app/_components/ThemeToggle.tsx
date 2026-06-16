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

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const pill = (on: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 h-7 rounded-[7px] text-xs font-semibold transition ${
      on ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.10)]" : "text-muted"
    }`;

  return (
    <div className="flex gap-1 rounded-[9px] border border-border bg-inset p-1">
      <button
        type="button"
        onClick={() => apply("light")}
        className={pill(theme === "light")}
        aria-pressed={theme === "light"}
      >
        <IconSun size={13} /> Light
      </button>
      <button
        type="button"
        onClick={() => apply("dark")}
        className={pill(theme === "dark")}
        aria-pressed={theme === "dark"}
      >
        <IconMoon size={13} /> Dark
      </button>
    </div>
  );
}
