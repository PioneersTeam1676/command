import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attendanceSessions, events } from "@/db/schema";
import { requireStudent } from "@/lib/parent-scope";
import { getCurrentSeason } from "@/lib/seasons";

/**
 * Parent-facing student data. Every function starts with `requireStudent`, which throws unless this
 * parent has an approved, non-revoked link to exactly this student. Never query student data for a
 * parent any other way.
 */
export async function studentSessionsForParent(parentId: string, studentId: string, seasonId?: string) {
  await requireStudent(parentId, studentId);
  const season = seasonId ?? (await getCurrentSeason()).id;
  const rows = await db
    .select({ session: attendanceSessions, eventTitle: events.title })
    .from(attendanceSessions)
    .leftJoin(events, eq(events.id, attendanceSessions.eventId))
    .where(and(eq(attendanceSessions.userId, studentId), eq(attendanceSessions.seasonId, season)))
    .orderBy(desc(attendanceSessions.clockInAt));
  // Parents see what counted and what didn't, but not internal reviewer notes.
  return rows.map((r) => ({ ...r.session, eventTitle: r.eventTitle, note: null as string | null }));
}
