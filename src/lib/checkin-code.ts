import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Rotating check-in codes (spec 6.5). A 6-digit code is derived from a per-event server-side secret
 * and the current 60-second window (HMAC + dynamic truncation, like TOTP). Nothing sensitive is in
 * the QR code: it only carries the event id and the current code. The previous code stays valid for
 * 30 seconds after a new one appears.
 */

export const CODE_STEP_MS = 60_000;
export const GRACE_MS = 30_000;

export const newSecret = () => randomBytes(32).toString("base64url");

export const windowIndex = (now: Date) => Math.floor(now.getTime() / CODE_STEP_MS);

export function codeForWindow(secret: string, index: number): string {
  const mac = createHmac("sha256", secret).update(String(index)).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 1_000_000).padStart(6, "0");
}

export function currentCode(secret: string, now: Date) {
  const index = windowIndex(now);
  return {
    code: codeForWindow(secret, index),
    /** When this code stops being shown (the next one appears). */
    refreshAt: new Date((index + 1) * CODE_STEP_MS),
  };
}

const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Accepts the current code, or the previous one for 30 s after it rotated. */
export function verifyCode(secret: string, input: string, now: Date): boolean {
  const cleaned = input.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const index = windowIndex(now);
  const intoWindow = now.getTime() - index * CODE_STEP_MS;
  let ok = eq(cleaned, codeForWindow(secret, index));
  if (intoWindow < GRACE_MS) ok = eq(cleaned, codeForWindow(secret, index - 1)) || ok;
  return ok;
}
