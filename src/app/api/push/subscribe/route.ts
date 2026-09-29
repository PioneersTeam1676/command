import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth/api";
import { hit } from "@/lib/auth/rate-limit";
import { saveSubscription } from "@/lib/push-devices";

export const dynamic = "force-dynamic";

const body = z.object({
  endpoint: z.string().url().max(2000).refine((u) => u.startsWith("https://"), "Push endpoints must be https"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

export async function POST(req: Request) {
  const a = await apiUser(req);
  if ("response" in a) return a.response;
  if (!(await hit(`push-sub:${a.user.id}`, 20, 3600)).allowed) return NextResponse.json({ ok: false, error: "Too many attempts." }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Bad subscription." }, { status: 400 });
  await saveSubscription(a.user.id, { endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, userAgent: req.headers.get("user-agent") });
  return NextResponse.json({ ok: true });
}
