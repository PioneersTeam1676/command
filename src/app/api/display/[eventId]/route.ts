import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getCurrentUser, roleAtLeast } from "@/lib/auth/current-user";
import { getEnv } from "@/lib/env";
import { getCheckinSecret } from "@/lib/checkin";
import { currentCode } from "@/lib/checkin-code";
import { getEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Current rotating code + QR for the check-in display. Leads and admins only. */
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || !roleAtLeast(user.role, "lead")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { eventId } = await params;
  if (!uuidSchema.safeParse(eventId).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const event = await getEvent(eventId);
  if (!event || event.cancelledAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const secret = await getCheckinSecret(eventId, true);
  const now = new Date();
  const { code, refreshAt } = currentCode(secret!, now);
  const url = `${getEnv().APP_URL.replace(/\/$/, "")}/checkin/${eventId}?code=${code}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  return NextResponse.json({ code, refreshAt: refreshAt.toISOString(), serverNow: now.toISOString(), qr }, { headers: { "cache-control": "no-store" } });
}
