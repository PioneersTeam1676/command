import { lt } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, clientActions, sessions } from "@/db/schema";

/** Expired sessions and single-use tokens are useless; delete them. Called from the hourly job. */
export async function purgeExpiredSessions(): Promise<void> {
  const now = new Date();
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(authTokens).where(lt(authTokens.expiresAt, new Date(now.getTime() - 24 * 3_600_000)));
  await db.delete(clientActions).where(lt(clientActions.createdAt, new Date(now.getTime() - 3 * 24 * 3_600_000)));
}
