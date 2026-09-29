import { NextResponse } from "next/server";
import { readLogo, sniffImage } from "@/lib/files";
import { readSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const { logoPath } = await readSettings();
  const buf = logoPath ? await readLogo(logoPath) : null;
  const type = buf ? sniffImage(buf) : null;
  if (!buf || !type) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: { "content-type": type.mime, "cache-control": "public, max-age=300", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
  });
}
