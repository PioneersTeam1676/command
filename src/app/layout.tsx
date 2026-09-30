import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { RegisterSW } from "@/components/pwa/register-sw";
import { ThemeProvider } from "@/components/theme-provider";
import { deriveAccent } from "@/lib/color";
import { readSettings } from "@/lib/settings";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Command", template: "%s · Command" },
  description: "Team attendance, calendar and notifications for robotics teams.",
  applicationName: "Command",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch.png" },
  appleWebApp: { capable: true, title: "Command", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

async function accentCss(): Promise<string> {
  let hex = "#0070f3";
  try {
    hex = (await readSettings()).accentColor;
  } catch {
    /* database not reachable yet: use default accent */
  }
  const a = deriveAccent(hex);
  return `:root{--accent:${a.base};--accent-hover:${a.hover};--accent-subtle:${a.subtle};--accent-fg:${a.foreground}}.dark{--accent-subtle:${a.subtleDark}}`;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const css = await accentCss();
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <ThemeProvider nonce={nonce}>
          {children}
          <RegisterSW />
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
