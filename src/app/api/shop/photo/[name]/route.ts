import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { readShopPhoto, sniffImage } from "@/lib/files";

export const dynamic = "force-dynamic";

/** Shop photos are for signed-in people only; the file name is a random id. */
export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return new NextResponse(null, { status: 401 });
  const { name } = await params;
  const buf = await readShopPhoto(name);
  const type = buf ? sniffImage(buf) : null;
  if (!buf || !type) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: { "content-type": type.mime, "cache-control": "private, max-age=3600, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
  });
}
