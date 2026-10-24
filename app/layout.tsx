import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Sidebar } from "@/app/_components/Sidebar";
import { AppShell } from "@/app/_components/AppShell";
import { DemoTour } from "@/app/_components/DemoTour";
import { demoEnabled, demoLimits } from "@/lib/demo/config";
import { AGENT_MODEL } from "@/lib/agent/llm";
import { modelLabel } from "@/lib/format";

// IBM Plex, self-hosted (latin woff2 from Fontsource, OFL — see app/fonts/) so the build
// never fetches from Google Fonts; that fetch flaked on CI runners.
const plexSans = localFont({
  src: "./fonts/ibm-plex-sans-latin-wght-normal.woff2",
  weight: "100 700",
  variable: "--font-plex-sans",
  display: "swap",
});

// Plex Mono has no variable build; ship only the weights the UI uses.
const plexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/ibm-plex-mono-latin-600-normal.woff2", weight: "600" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  adjustFontFallback: false, // the default Arial-metric fallback is wrong for a monospace face
});

// Every page (and the sidebar in this layout) reads the database, so nothing is
// prerendered at build time — the image build has no DATABASE_URL.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BoxBot — Inbox Agent",
  description:
    "Support / ops inbox assistant — an AI agent chains tools and stages replies a human approves.",
};

// Set the theme on <html> before paint so there's no light/dark flash on load.
const noFlash = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      {/* dvh, not vh: on phones vh includes the area under the browser's toolbars. */}
      <body className="h-dvh overflow-hidden">
        <AppShell sidebar={<Sidebar />} demo={demoEnabled()}>
          {children}
        </AppShell>
        {demoEnabled() && <DemoTour runsLimit={demoLimits().runsPerVisitor} model={modelLabel(AGENT_MODEL)} />}
      </body>
    </html>
  );
}
