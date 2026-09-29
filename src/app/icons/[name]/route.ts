import { NextResponse } from "next/server";
import sharp from "sharp";
import { deriveAccent, hexToRgb } from "@/lib/color";
import { readLogo } from "@/lib/files";
import { readSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const SPECS: Record<string, { size: number; pad: number }> = {
  "icon-192.png": { size: 192, pad: 0.12 },
  "icon-512.png": { size: 512, pad: 0.12 },
  // Maskable icons keep important content inside the central ~80% "safe zone".
  "maskable-512.png": { size: 512, pad: 0.22 },
  "apple-touch.png": { size: 180, pad: 0.12 },
};

/** Default glyph (no fonts needed): a clock face on the accent colour. */
const defaultGlyph = (fg: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="none" stroke="${fg}" stroke-width="8"/><path d="M50 26v26l17 10" fill="none" stroke="${fg}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  );

/** PWA icons generated from the team logo (or a default glyph) on the accent colour. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const spec = SPECS[(await params).name];
  if (!spec) return new NextResponse(null, { status: 404 });
  const s = await readSettings();
  const accent = deriveAccent(s.accentColor);
  const [r, g, b] = hexToRgb(accent.base)!;
  const inner = Math.round(spec.size * (1 - spec.pad * 2));
  const logo = s.logoPath ? await readLogo(s.logoPath) : null;

  let glyph: Buffer;
  try {
    glyph = await sharp(logo ?? defaultGlyph(accent.foreground)).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  } catch {
    glyph = await sharp(defaultGlyph(accent.foreground)).resize(inner, inner).png().toBuffer();
  }
  const png = await sharp({ create: { width: spec.size, height: spec.size, channels: 4, background: { r, g, b, alpha: 1 } } })
    .composite([{ input: glyph, gravity: "center" }])
    .png()
    .toBuffer();
  return new NextResponse(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
}
