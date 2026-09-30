"use client";
import { useEffect } from "react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";

/**
 * The static theme-color tags follow the phone's setting, not the theme picked in the app,
 * so a dark app on a light phone got a white status bar. Keep a single tag in step with the real theme.
 */
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    const color = resolvedTheme === "dark" ? "#000000" : "#ffffff";
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = color;
    document.head.appendChild(meta);
  }, [resolvedTheme]);
  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ThemeColorSync />
      {children}
    </NextThemes>
  );
}
