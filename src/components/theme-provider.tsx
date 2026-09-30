"use client";
import { useSyncExternalStore } from "react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";

const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * React owns this tag, including its updates during navigation. Removing metadata
 * nodes imperatively breaks React's next commit and leaves the previous page on screen.
 */
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  // The saved theme is only known in the browser. Match the server on hydration
  // so React adopts the existing tag instead of inserting a second one.
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return <meta name="theme-color" content={mounted && resolvedTheme === "dark" ? "#000000" : "#ffffff"} />;
}

export function ThemeProvider({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
      <ThemeColorSync />
      {children}
    </NextThemes>
  );
}
