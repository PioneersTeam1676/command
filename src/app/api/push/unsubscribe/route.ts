import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth/api";
import { removeSubscription } from "@/lib/push-devices";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await apiUser(req);
  if ("response" in a) return a.response;
  const parsed = z.object({ endpoint: z.string().max(2000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  await removeSubscription(a.user.id, parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
