import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/db";
import { seasons, teamSettings, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hashToken, randomToken, safeEqual } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/env";
import { readSettings } from "@/lib/settings";

/**
 * On first boot a one-time setup token is printed to the container logs. The wizard needs it so
 * nobody can take over a freshly exposed instance. A new token is generated on every start until
 * setup completes (or you set SETUP_TOKEN yourself).
 */
export async function ensureSetupToken(): Promise<void> {
  const settings = await readSettings();
  if (settings.setupCompletedAt) return;
  const envToken = getEnv().SETUP_TOKEN;
  const token = envToken ?? randomBytes(9).toString("base64url");
  await db.update(teamSettings).set({ setupTokenHash: hashToken(token) }).where(eq(teamSettings.id, 1));
  const line = "=".repeat(64);
  console.log(
    [
      "",
      line,
      "  COMMAND SETUP",
      `  Open ${getEnv().APP_URL.replace(/\/$/, "")}/setup and enter this one-time token:`,
      "",
      envToken ? "  (using SETUP_TOKEN from your environment)" : `  ${token}`,
      line,
      "",
    ].join("\n"),
  );
}

export async function verifySetupToken(input: string): Promise<boolean> {
  const settings = await readSettings();
  if (settings.setupCompletedAt || !settings.setupTokenHash) return false;
  return safeEqual(hashToken(input.trim()), settings.setupTokenHash);
}

/** Generate the secrets the app needs (VAPID keys, session secret, install id) if they don't exist yet. */
export async function ensureSecrets(): Promise<void> {
  const s = await readSettings();
  const patch: Partial<typeof teamSettings.$inferInsert> = {};
  if (!s.sessionSecret) patch.sessionSecret = randomToken(48);
  if (!s.installId) patch.installId = crypto.randomUUID();
  if (!s.vapidPublic || !s.vapidPrivate) {
    const keys = webpush.generateVAPIDKeys();
    patch.vapidPublic = keys.publicKey;
    patch.vapidPrivate = keys.privateKey;
  }
  if (Object.keys(patch).length) await db.update(teamSettings).set(patch).where(eq(teamSettings.id, 1));
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz.length > 0 && tz.length < 64;
  } catch {
    return false;
  }
}

export async function adminExists(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  return rows.length > 0;
}

/** Finish setup: everything else was saved step by step. Creates the first season and locks /setup. */
export async function completeSetup(adminId: string) {
  await ensureSecrets();
  const s = await readSettings();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: s.timezone }).format(new Date());
  await db.transaction(async (tx) => {
    await tx.update(teamSettings).set({ setupCompletedAt: new Date(), setupTokenHash: null }).where(eq(teamSettings.id, 1));
    const existing = await tx.select({ id: seasons.id }).from(seasons).limit(1);
    if (existing.length === 0) {
      await tx.insert(seasons).values({ name: `${today.slice(0, 4)} Season`, startDate: today, isCurrent: true });
    }
    await audit({ actorId: adminId, action: "setup.complete", targetType: "team", after: { name: s.name, timezone: s.timezone } }, tx);
  });
}
