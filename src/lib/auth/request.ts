import { headers } from "next/headers";
import { createHmac } from "node:crypto";
import { getEnv } from "@/lib/env";
import { readSettings } from "@/lib/settings";

/**
 * Client IP as seen through the reverse proxy. The first X-Forwarded-For hop can be spoofed when the
 * app is exposed directly, so per-IP limits are a speed bump; per-account limits are the real guard.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || h.get("x-real-ip") || "unknown";
}

export async function ipHash(ip: string): Promise<string> {
  const { sessionSecret } = await readSettings();
  return createHmac("sha256", sessionSecret ?? "unset").update(ip).digest("hex").slice(0, 32);
}

/**
 * Origin check for mutations (defence in depth on top of SameSite=Lax; Next also checks
 * Origin vs Host on server actions). Use in route handlers that accept POST.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const allowed = new URL(getEnv().APP_URL).origin;
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const o = new URL(origin);
    return o.origin === allowed || (host !== null && o.host === host);
  } catch {
    return false;
  }
}

export const isSecureDeployment = () => getEnv().APP_URL.startsWith("https://");
