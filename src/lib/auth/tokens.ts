import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes, URL-safe. Give this to the user; store only `hashToken(token)`. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** Temporary passwords avoid look-alike characters so they can be read out loud or typed from a screen. */
export function temporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(14);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 9)}-${out.slice(9)}`;
}
