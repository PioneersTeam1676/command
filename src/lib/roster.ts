import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { attendanceSessions, events, users } from "@/db/schema";
import { totalMs, msByLocalDate, type HoursSession } from "@/lib/hours";
import { overlappingIds } from "@/lib/overlaps";

export type HereRow = {
  sessionId: string;
  userId: string;
  name: string;
  since: Date;
  kind: string;
  eventTitle: string | null;
  origin: string;
};

/** Everyone currently clocked in (open sessions), oldest first. */
export async function whoIsHere(): Promise<HereRow[]> {
  const rows = await db
    .select({ s: attendanceSessions, name: users.name, eventTitle: events.title })
    .from(attendanceSessions)
    .innerJoin(users, eq(users.id, attendanceSessions.userId))
    .leftJoin(events, eq(events.id, attendanceSessions.eventId))
    .where(and(eq(attendanceSessions.status, "open"), eq(users.status, "active")))
    .orderBy(asc(attendanceSessions.clockInAt));
  return rows.map((r) => ({ sessionId: r.s.id, userId: r.s.userId, name: r.name, since: r.s.clockInAt, kind: r.s.kind, eventTitle: r.eventTitle, origin: r.s.origin }));
}

export type RosterRow = {
  userId: string;
  name: string;
  role: string;
  hours: number;
  days: number;
  eventsAttended: number;
  /** Events tagged as outreach that they checked in to (same rules as `eventsAttended`). */
  outreachAttended: number;
  needsReview: number;
  pendingApproval: number;
};

/** Hours per active member for a season. Hours use the union of intervals (never double counted). */
export async function rosterForSeason(seasonId: string, tz: string): Promise<RosterRow[]> {
  const members = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.status, "active"), inArray(users.role, ["member", "lead", "admin"])))
    .orderBy(asc(users.name));
  const sessions = await db.select().from(attendanceSessions).where(eq(attendanceSessions.seasonId, seasonId));
  const outreach = new Set((await db.select({ id: events.id }).from(events).where(and(eq(events.seasonId, seasonId), eq(events.isOutreach, true)))).map((e) => e.id));
  const by = new Map<string, typeof sessions>();
  for (const s of sessions) by.set(s.userId, [...(by.get(s.userId) ?? []), s]);
  return members.map((m) => {
    const list = by.get(m.id) ?? [];
    const attended = list.filter((s) => s.kind === "event" && s.eventId && s.reviewState !== "rejected" && s.reviewState !== "pending_approval");
    const hs: HoursSession[] = list.map((s) => ({ clockInAt: s.clockInAt, clockOutAt: s.clockOutAt, status: s.status, reviewState: s.reviewState }));
    return {
      userId: m.id,
      name: m.name,
      role: m.role,
      hours: totalMs(hs) / 3_600_000,
      days: msByLocalDate(hs, tz).size,
      eventsAttended: attended.length,
      outreachAttended: attended.filter((s) => outreach.has(s.eventId!)).length,
      needsReview: list.filter((s) => s.reviewState === "needs_review").length,
      pendingApproval: list.filter((s) => s.reviewState === "pending_approval").length,
    };
  });
}

export async function memberSessions(userId: string, seasonId: string) {
  const rows = await db
    .select({ session: attendanceSessions, eventTitle: events.title, isOutreach: events.isOutreach })
    .from(attendanceSessions)
    .leftJoin(events, eq(events.id, attendanceSessions.eventId))
    .where(and(eq(attendanceSessions.userId, userId), eq(attendanceSessions.seasonId, seasonId)))
    .orderBy(desc(attendanceSessions.clockInAt));
  const flagged = overlappingIds(rows.map((r) => r.session));
  return rows.map((r) => ({ ...r.session, eventTitle: r.eventTitle, isOutreach: r.isOutreach ?? false, overlaps: flagged.has(r.session.id) }));
}
