import { cookies, headers } from "next/headers";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashToken, randomToken } from "./tokens";
import { clientIp, ipHash, isSecureDeployment } from "./request";

export const SESSION_COOKIE = "cmd_session";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
/** Re-extend the rolling expiry at most once an hour to avoid a write per request. */
const EXTEND_AFTER_MS = 60 * 60 * 1000;

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: isSecureDeployment(),
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
  const h = await headers();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    ipHash: await ipHash(await clientIp()),
  });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export type SessionUser = typeof users.$inferSelect;

/** Look up the session from the cookie. Extends the rolling expiry. Returns null when signed out. */
export async function readSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = hashToken(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id));
  if (!row) return null;
  const now = Date.now();
  if (row.session.expiresAt.getTime() <= now || row.user.status === "deactivated" || row.user.status === "denied") {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  const newExpiry = now + THIRTY_DAYS_MS;
  if (newExpiry - row.session.expiresAt.getTime() > EXTEND_AFTER_MS) {
    await db.update(sessions).set({ expiresAt: new Date(newExpiry) }).where(eq(sessions.id, id));
    // Cookies can only be written from actions/route handlers; ignore when called during render.
    try {
      (await cookies()).set(SESSION_COOKIE, token, cookieOptions(new Date(newExpiry)));
    } catch {
      /* rendering: the DB expiry is extended, cookie is refreshed on the next mutation */
    }
  }
  return row.user;
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

/** End every session for a user (deactivation, password change, reset). */
export async function destroyAllSessions(userId: string, exceptCurrent = false): Promise<void> {
  if (!exceptCurrent) {
    await db.delete(sessions).where(eq(sessions.userId, userId));
    return;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const keep = token ? hashToken(token) : "";
  const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
  for (const r of rows) if (r.id !== keep) await db.delete(sessions).where(eq(sessions.id, r.id));
}

export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(and(lt(sessions.expiresAt, new Date())));
}
