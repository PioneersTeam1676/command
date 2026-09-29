import { NextResponse } from "next/server";
import { deriveAccent } from "@/lib/color";
import { readSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Served dynamically so the installed app carries the team's name, colour and logo. */
export async function GET() {
  const s = await readSettings();
  const accent = deriveAccent(s.accentColor);
  const version = encodeURIComponent(`${s.accentColor}-${s.logoPath ?? "none"}`);
  const icon = (name: string, size: number, purpose: string) => ({ src: `/icons/${name}?v=${version}`, sizes: `${size}x${size}`, type: "image/png", purpose });
  return NextResponse.json(
    {
      name: s.name,
      short_name: s.name.length > 12 ? s.name.slice(0, 12).trim() : s.name,
      description: `${s.name} attendance, calendar and reminders.`,
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: accent.base,
      icons: [icon("icon-192.png", 192, "any"), icon("icon-512.png", 512, "any"), icon("maskable-512.png", 512, "maskable")],
      shortcuts: [{ name: "Calendar", url: "/calendar" }],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=300" } },
  );
}
