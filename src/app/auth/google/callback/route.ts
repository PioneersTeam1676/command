import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { findUserByEmail, normalizeEmail, resolveGoogleLogin, statusGate } from "@/lib/accounts";
import { safeEqual } from "@/lib/auth/tokens";
import { finishGoogleAuth, googleEnabled } from "@/lib/auth/google";
import { isSecureDeployment } from "@/lib/auth/request";
import { createSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { safeNext } from "@/lib/form";
import { readSettings } from "@/lib/settings";
import { adminExists, verifySetupToken } from "@/lib/setup";

export const dynamic = "force-dynamic";

function back(path: string, flash?: string) {
  const res = NextResponse.redirect(new URL(path, getEnv().APP_URL));
  for (const n of ["g_state", "g_verifier", "g_ctx"]) res.cookies.delete(n);
  if (flash) res.cookies.set("cmd_flash", encodeURIComponent(flash), { httpOnly: true, secure: isSecureDeployment(), sameSite: "lax", path: "/", maxAge: 60 });
  return res;
}

export async function GET(req: NextRequest) {
  if (!googleEnabled()) return back("/login");
  const jar = await cookies();
  const state = jar.get("g_state")?.value;
  const verifier = jar.get("g_verifier")?.value;
  let ctx: { intent?: string; next?: string } = {};
  try {
    ctx = JSON.parse(jar.get("g_ctx")?.value ?? "{}");
  } catch {
    /* ignore */
  }
  const code = req.nextUrl.searchParams.get("code");
  const gotState = req.nextUrl.searchParams.get("state");
  if (!state || !verifier || !code || !gotState || !safeEqual(state, gotState)) {
    return back("/login", "Google sign-in didn't complete. Please try again.");
  }
  const claims = await finishGoogleAuth(code, verifier);
  if (!claims) return back("/login", "Google sign-in didn't complete. Please try again.");
  const next = safeNext(ctx.next);

  if (ctx.intent === "setup") {
    const settings = await readSettings();
    const ticket = jar.get("cmd_setup")?.value;
    if (settings.setupCompletedAt || !ticket || !(await verifySetupToken(ticket))) return back("/setup");
    if (!claims.emailVerified) return back("/setup?step=account", "Google says this email isn't verified, so it can't be used for the admin account.");
    const email = normalizeEmail(claims.email);
    let user = await findUserByEmail(email);
    if (!user) {
      if (await adminExists()) return back("/setup?step=account", "An admin account already exists for this setup. Sign in with that one.");
      [user] = await db
        .insert(users)
        .values({ email, name: claims.name || email, role: "admin", status: "active", googleSub: claims.sub, emailVerifiedAt: new Date() })
        .returning();
    } else if (user.role !== "admin" || (user.googleSub && user.googleSub !== claims.sub)) {
      return back("/setup?step=account", "That Google account isn't the admin created for this setup.");
    } else if (!user.googleSub) {
      await db.update(users).set({ googleSub: claims.sub, emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
    }
    await createSession(user!.id);
    return back("/setup?step=team");
  }

  const intent = ctx.intent === "parent" ? "parent" : "login";
  const result = await resolveGoogleLogin(claims, intent);
  if (!result.ok) return back("/login", result.error);
  const [user] = await db.select().from(users).where(eq(users.id, result.userId));
  const gate = user ? await statusGate(user) : { ok: false as const, error: "Account not found." };
  if (!gate.ok) return back("/login", gate.error);
  await createSession(result.userId);
  return back(next);
}
