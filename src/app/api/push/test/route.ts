import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth/api";
import { hit } from "@/lib/auth/rate-limit";
import { sendPushToUser } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await apiUser(req);
  if ("response" in a) return a.response;
  if (!(await hit(`push-test:${a.user.id}`, 5, 300)).allowed) return NextResponse.json({ ok: false, error: "Wait a few minutes before sending another test." }, { status: 429 });
  const delivered = await sendPushToUser(a.user.id, { title: "Notifications are on", body: "This is a test from Command. You're all set.", url: "/me/notifications", tag: "test" });
  return NextResponse.json({ ok: delivered > 0, delivered, error: delivered > 0 ? undefined : "We couldn't reach any of your devices. Try turning notifications off and on again." });
}
