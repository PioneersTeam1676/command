import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth/api";
import { recordPermission } from "@/lib/push-devices";

export const dynamic = "force-dynamic";

/** The browser reports its notification permission so admins can tell "denied" from "never asked". */
export async function POST(req: Request) {
  const a = await apiUser(req);
  if ("response" in a) return a.response;
  const parsed = z.object({ permission: z.enum(["granted", "denied", "default"]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  await recordPermission(a.user.id, parsed.data.permission);
  return NextResponse.json({ ok: true });
}
