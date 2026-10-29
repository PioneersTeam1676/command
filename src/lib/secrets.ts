import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { getEnv } from "@/lib/env";

const PREFIX = "v1";

export const secretsConfigured = () => Boolean(getEnv().SHARED_LOGIN_KEY);

function key(): Buffer {
  const raw = getEnv().SHARED_LOGIN_KEY;
  if (!raw) throw new Error("SHARED_LOGIN_KEY is not set.");
  return Buffer.from(hkdfSync("sha256", raw, "command-shared-logins", "aes-256-gcm", 32));
}

/** AES-256-GCM. Output is `v1.<iv>.<tag>.<ciphertext>` (base64url), safe to keep in a text column. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [PREFIX, iv, c.getAuthTag(), body].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** Throws if the value was tampered with or the key changed. */
export function decryptSecret(stored: string): string {
  const [v, iv, tag, body] = stored.split(".");
  if (v !== PREFIX || !iv || !tag || !body) throw new Error("Unreadable secret.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}
