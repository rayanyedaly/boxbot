import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Sidebar } from "@/app/_components/Sidebar";
import { DemoTour } from "@/app/_components/DemoTour";
import { demoEnabled, demoLimits } from "@/lib/demo/config";
import { AGENT_MODEL } from "@/lib/agent/llm";
import { modelLabel } from "@/lib/format";

// Self-hosted (latin variable woff2 from Fontsource, OFL — see app/fonts/) so the build
// never fetches from Google Fonts; that fetch flaked on CI runners.
const schibstedGrotesk = localFont({
  src: "./fonts/schibsted-grotesk-latin-wght-normal.woff2",
  weight: "400 900",
  variable: "--font-schibsted",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  variable: "--font-jetbrains",
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
      className={`${schibstedGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body className="h-screen overflow-hidden">
        <div className="flex h-full">
          <Sidebar />
          <main className="h-full min-w-0 flex-1 overflow-y-auto">{children}</main>
        </div>
        {demoEnabled() && <DemoTour runsLimit={demoLimits().runsPerVisitor} model={modelLabel(AGENT_MODEL)} />}
      </body>
    </html>
  );
}
