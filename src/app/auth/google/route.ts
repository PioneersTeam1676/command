import { NextResponse, type NextRequest } from "next/server";
import { googleEnabled, startGoogleAuth } from "@/lib/auth/google";
import { isSecureDeployment } from "@/lib/auth/request";
import { hit } from "@/lib/auth/rate-limit";
import { safeNext } from "@/lib/form";
import { readSettings } from "@/lib/settings";
import { verifySetupToken } from "@/lib/setup";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const shortCookie = () => ({ httpOnly: true, secure: isSecureDeployment(), sameSite: "lax" as const, path: "/", maxAge: 600 });

export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
  if (!googleEnabled()) return NextResponse.redirect(new URL("/login", appUrl));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await hit(`google-start:${ip}`, 30, 600)).allowed) return new NextResponse("Too many attempts", { status: 429 });

  const intentParam = req.nextUrl.searchParams.get("intent");
  const intent = intentParam === "parent" || intentParam === "setup" ? intentParam : "login";
  if (intent === "setup") {
    const settings = await readSettings();
    const ticket = (await cookies()).get("cmd_setup")?.value;
    if (settings.setupCompletedAt || !ticket || !(await verifySetupToken(ticket))) {
      return NextResponse.redirect(new URL("/setup", appUrl));
    }
  }
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const { url, state, verifier } = startGoogleAuth();
  const res = NextResponse.redirect(url);
  res.cookies.set("g_state", state, shortCookie());
  res.cookies.set("g_verifier", verifier, shortCookie());
  res.cookies.set("g_ctx", JSON.stringify({ intent, next }), shortCookie());
  return res;
}
