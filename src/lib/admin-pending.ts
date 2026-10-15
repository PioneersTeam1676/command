import { cache } from "react";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, attendanceSessions, parentLinks } from "@/db/schema";
import { pendingRequestCount, unusualEntries } from "@/lib/attendance-requests";

const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;

/**
 * Everything waiting on a lead or admin: attendance to check, change requests, unusual entries, and (admins) join and
 * parent requests. Runs for every staff page, so it counts in the database, runs the counts together, and is computed
 * once per request.
 */
export const pendingReviewCount = cache(async (isAdmin: boolean): Promise<number> => {
  const parts = await Promise.all([
    count(db.select({ n: sql<number>`count(*)::int` }).from(attendanceSessions).where(inArray(attendanceSessions.reviewState, ["needs_review", "pending_approval"]))),
    pendingRequestCount(),
    unusualEntries().then((r) => r.length),
    isAdmin ? count(db.select({ n: sql<number>`count(*)::int` }).from(accessRequests).where(eq(accessRequests.status, "pending"))) : 0,
    isAdmin ? count(db.select({ n: sql<number>`count(*)::int` }).from(parentLinks).where(and(eq(parentLinks.status, "pending")))) : 0,
  ]);
  return parts.reduce((a, b) => a + b, 0);
});
