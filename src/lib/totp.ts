import { createHmac } from "node:crypto";

export const TOTP_STEP = 30;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 as authenticator apps show it: spaces, dashes, lowercase and `=` padding are all fine. Null if invalid. */
export function base32Decode(input: string): Buffer | null {
  const clean = input.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (clean.length === 0) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 (SHA-1, which is what authenticator apps default to). `at` is milliseconds. */
export function totp(secret: Buffer, at: number = Date.now(), digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / TOTP_STEP)));
  const h = createHmac("sha1", secret).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** Seconds until the current code stops working. */
export const secondsLeft = (at: number = Date.now()) => TOTP_STEP - (Math.floor(at / 1000) % TOTP_STEP);
