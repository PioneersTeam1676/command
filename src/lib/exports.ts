import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm";
import { db } from "@/db";
import { attendanceSessions, auditLog, events, rsvps, users } from "@/db/schema";
import { csvResponse, toCsv } from "@/lib/csv";
import { countsTowardHours } from "@/lib/hours";
import { rosterForSeason } from "@/lib/roster";
import { getSeason } from "@/lib/seasons";
import { formatInTz } from "@/lib/time";

const hoursCell = (h: number) => Math.round(h * 100) / 100;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Hours per member for a season. Admin only. */
export async function exportHours(seasonId: string, tz: string) {
  const season = await getSeason(seasonId);
  if (!season) return null;
  const roster = await rosterForSeason(seasonId, tz);
  const emails = new Map((await db.select({ id: users.id, email: users.email }).from(users)).map((u) => [u.id, u.email]));
  const rows = roster.map((r) => [r.name, emails.get(r.userId) ?? "", r.role, season.name, hoursCell(r.hours), r.days, r.eventsAttended, r.needsReview, r.pendingApproval]);
  return csvResponse(`hours-${slug(season.name)}.csv`, toCsv(["Name", "Email", "Role", "Season", "Hours", "Days with time", "Events attended", "Auto-closed awaiting review", "Backfill awaiting approval"], rows));
}

/** Every attendance entry in a season, one row per session. Admin only. */
export async function exportAttendance(seasonId: string, tz: string) {
  const season = await getSeason(seasonId);
  if (!season) return null;
  const rows = await db
    .select({ s: attendanceSessions, name: users.name, eventTitle: events.title })
    .from(attendanceSessions)
    .innerJoin(users, eq(users.id, attendanceSessions.userId))
    .leftJoin(events, eq(events.id, attendanceSessions.eventId))
    .where(eq(attendanceSessions.seasonId, seasonId))
    .orderBy(asc(attendanceSessions.clockInAt));
  const body = rows.map(({ s, name, eventTitle }) => [
    eventTitle ?? "Build season clock-in",
    formatInTz(s.clockInAt, tz, "yyyy-MM-dd"),
    name,
    formatInTz(s.clockInAt, tz, "yyyy-MM-dd HH:mm"),
    s.clockOutAt ? formatInTz(s.clockOutAt, tz, "yyyy-MM-dd HH:mm") : "",
    s.clockOutAt ? hoursCell((s.clockOutAt.getTime() - s.clockInAt.getTime()) / 3_600_000) : "",
    countsTowardHours(s) ? "yes" : "no",
    s.kind,
    s.status,
    s.reviewState,
    s.origin,
    s.selfReported ? "yes" : "no",
    s.note ?? "",
  ]);
  return csvResponse(`attendance-${slug(season.name)}.csv`, toCsv(["Event", "Date", "Member", "In", "Out", "Hours", "Counts toward hours", "Kind", "Status", "Review", "Origin", "Self-reported", "Note"], body));
}

/** RSVPs for every event in a season. Admin only. */
export async function exportRsvps(seasonId: string, tz: string) {
  const season = await getSeason(seasonId);
  if (!season) return null;
  const rows = await db
    .select({ e: events, r: rsvps, name: users.name })
    .from(rsvps)
    .innerJoin(events, eq(events.id, rsvps.eventId))
    .innerJoin(users, eq(users.id, rsvps.userId))
    .where(eq(events.seasonId, seasonId))
    .orderBy(asc(events.startsAt), asc(users.name));
  const body = rows.map(({ e, r, name }) => [e.title, formatInTz(e.startsAt, tz, "yyyy-MM-dd HH:mm"), e.cancelledAt ? "cancelled" : "", name, r.response, r.reason ?? "", r.updatedAt]);
  return csvResponse(`rsvps-${slug(season.name)}.csv`, toCsv(["Event", "Starts", "Status", "Member", "Response", "Reason", "Answered at"], body));
}

/** The audit log, optionally between two dates (UTC day boundaries). Admin only. */
export async function exportAudit(range: { from?: Date; to?: Date }) {
  const actor = aliasedTable(users, "actor");
  const conds = [];
  if (range.from) conds.push(gte(auditLog.createdAt, range.from));
  if (range.to) conds.push(lt(auditLog.createdAt, range.to));
  const rows = await db
    .select({ a: auditLog, actorName: actor.name })
    .from(auditLog)
    .leftJoin(actor, eq(actor.id, auditLog.actorId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(50_000);
  const body = rows.map(({ a, actorName }) => [a.createdAt, actorName ?? "(system)", a.action, a.targetType ?? "", a.targetId ?? "", a.before ? JSON.stringify(a.before) : "", a.after ? JSON.stringify(a.after) : ""]);
  return csvResponse("audit-log.csv", toCsv(["Time (UTC)", "Who", "Action", "Target type", "Target id", "Before", "After"], body));
}

/** A member's own hours for a season. Always available to that member. */
export async function exportMyHours(userId: string, seasonId: string, tz: string) {
  const season = await getSeason(seasonId);
  if (!season) return null;
  const rows = await db
    .select({ s: attendanceSessions, eventTitle: events.title })
    .from(attendanceSessions)
    .leftJoin(events, eq(events.id, attendanceSessions.eventId))
    .where(and(eq(attendanceSessions.userId, userId), eq(attendanceSessions.seasonId, seasonId)))
    .orderBy(asc(attendanceSessions.clockInAt));
  const body = rows.map(({ s, eventTitle }) => [
    eventTitle ?? "Build season clock-in",
    formatInTz(s.clockInAt, tz, "yyyy-MM-dd HH:mm"),
    s.clockOutAt ? formatInTz(s.clockOutAt, tz, "yyyy-MM-dd HH:mm") : "",
    s.clockOutAt ? hoursCell((s.clockOutAt.getTime() - s.clockInAt.getTime()) / 3_600_000) : "",
    countsTowardHours(s) ? "yes" : "no",
    s.reviewState,
  ]);
  return csvResponse(`my-hours-${slug(season.name)}.csv`, toCsv(["What", "In", "Out", "Hours", "Counts toward hours", "Review"], body));
}
