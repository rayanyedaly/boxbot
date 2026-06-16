// app/_components/icons.tsx
//
// Inline SVG icon set (stroke uses currentColor so color follows text-color / inline
// style). Replaces all emoji usage — the design is deliberately non-AI-looking.

type IconProps = { size?: number; className?: string; strokeWidth?: number };

function svg(
  { size = 16, className, strokeWidth = 2 }: IconProps,
  children: React.ReactNode,
) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const IconSearch = (p: IconProps) =>
  svg(p, <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></>);

export const IconInbox = (p: IconProps) =>
  svg(p, <><path d="M3 13h4l2 3h6l2-3h4" /><path d="M3 13V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7" /></>);

export const IconGrid = (p: IconProps) =>
  svg(p, <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);

export const IconBook = (p: IconProps) =>
  svg(p, <><path d="M4 5a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2z" /><line x1="8" y1="7" x2="15" y2="7" /><line x1="8" y1="11" x2="13" y2="11" /></>);

export const IconSun = (p: IconProps) =>
  svg(p, <><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" /><line x1="4" y1="12" x2="2" y2="12" /><line x1="22" y1="12" x2="20" y2="12" /><line x1="5.6" y1="5.6" x2="4.2" y2="4.2" /><line x1="19.8" y1="19.8" x2="18.4" y2="18.4" /><line x1="18.4" y1="5.6" x2="19.8" y2="4.2" /><line x1="4.2" y1="19.8" x2="5.6" y2="18.4" /></>);

export const IconMoon = (p: IconProps) =>
  svg(p, <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />);

export const IconChevronUpDown = (p: IconProps) =>
  svg(p, <><polyline points="7 9 12 4 17 9" /><polyline points="7 15 12 20 17 15" /></>);

export const IconArrowLeft = (p: IconProps) =>
  svg(p, <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="11 18 5 12 11 6" /></>);

export const IconArrowRight = (p: IconProps) =>
  svg(p, <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" /></>);

export const IconCheck = (p: IconProps) =>
  svg(p, <polyline points="4 12 9 17 20 6" />);

export const IconDraft = (p: IconProps) =>
  svg(p, <><path d="M12 3l2.2 4.6L19 8.3l-3.5 3.4.8 4.9L12 14.3 7.7 16.6l.8-4.9L5 8.3l4.8-.7z" /></>);

export const IconWarning = (p: IconProps) =>
  svg(p, <><path d="M10.3 3.8 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></>);

export const IconPlus = (p: IconProps) =>
  svg(p, <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>);

export const IconPanelCollapse = (p: IconProps) =>
  svg(p, <><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="15" y1="4" x2="15" y2="20" /></>);

export const IconActivity = (p: IconProps) =>
  svg(p, <polyline points="3 12 7 12 10 5 14 19 17 12 21 12" />);
