import { NextResponse } from "next/server";
import { getCurrentUser } from "./current-user";
import { isSameOrigin } from "./request";
import type { SessionUser } from "./session";

/** Guard for JSON mutation endpoints: same-origin + signed-in active user. */
export async function apiUser(req: Request): Promise<{ user: SessionUser } | { response: NextResponse }> {
  if (!isSameOrigin(req)) return { response: NextResponse.json({ ok: false, error: "Bad origin." }, { status: 403 }) };
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return { response: NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 }) };
  return { user };
}
