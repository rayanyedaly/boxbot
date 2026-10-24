// app/_components/ui.tsx
//
// Small shared primitives so pages don't each carry their own copy of the same card,
// stat tile and button classes. Presentation only; no state.

const BUTTON = {
  primary: "bg-accent text-on-accent hover:opacity-90",
  secondary: "border border-border bg-surface text-ink-2 hover:bg-inset hover:text-ink",
  ghost: "text-ink-3 hover:bg-inset hover:text-ink",
} as const;

/** Class string for a button-styled <button> or <Link>; add size/layout classes per use. */
export function buttonClass(variant: keyof typeof BUTTON = "primary") {
  return `inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[variant]}`;
}

/** A plain label above a group: sentence case, not an all-caps eyebrow. */
export function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-xs font-medium text-muted ${className}`}>{children}</div>;
}

export function Card({
  title,
  sub,
  children,
  className = "",
}: {
  title?: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-5 ${className}`}>
      {title && (
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {sub && <span className="text-xs text-muted">{sub}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Label over a figure. `size="lg"` for KPI tiles, default for compact summary grids. */
export function Stat({
  label,
  value,
  sub,
  subColor,
  size = "md",
}: {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  size?: "md" | "lg";
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={`truncate font-mono font-semibold tabular-nums text-ink ${
          size === "lg" ? "mt-1.5 text-xl sm:text-2xl" : "mt-0.5 text-lg"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-xs text-muted" style={subColor ? { color: subColor } : undefined}>
          {sub}
        </div>
      )}
    </div>
  );
}
