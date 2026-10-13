import { overlappingIds } from "@/lib/overlaps";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm";
import { db } from "@/db";
import { attendanceSessions, auditLog, events, signupEntries, signupSheets, signupSlots, users } from "@/db/schema";
import { csvResponse, toCsv } from "@/lib/csv";
import { countsTowardHours } from "@/lib/hours";
import { rosterForSeason } from "@/lib/roster";
import { getSeason } from "@/lib/seasons";
import { formatInTz } from "@/lib/time";

const hoursCell = (h: number) => Math.round(h * 100) / 100;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Hours per member for a season. Admin only. */
export async function exportHours(seasonId: string, tz: string, withOutreach = false) {
  const season = await getSeason(seasonId);
  if (!season) return null;
  const roster = await rosterForSeason(seasonId, tz);
  const emails = new Map((await db.select({ id: users.id, email: users.email }).from(users)).map((u) => [u.id, u.email]));
  const rows = roster.map((r) => [r.name, emails.get(r.userId) ?? "", r.role, season.name, hoursCell(r.hours), r.days, r.eventsAttended, ...(withOutreach ? [r.outreachAttended] : []), r.needsReview, r.pendingApproval]);
  const header = ["Name", "Email", "Role", "Season", "Hours", "Days with time", "Events attended", ...(withOutreach ? ["Outreach events attended"] : []), "Auto-closed awaiting review", "Time awaiting approval"];
  return csvResponse(`hours-${slug(season.name)}.csv`, toCsv(header, rows));
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
  const flagged = overlappingIds(rows.map((r) => r.s));
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
    s.origin === "backfill" ? "yes" : "no",
    flagged.has(s.id) ? "yes" : "no",
    s.note ?? "",
  ]);
  return csvResponse(`attendance-${slug(season.name)}.csv`, toCsv(["Event", "Date", "Member", "In", "Out", "Hours", "Counts toward hours", "Kind", "Status", "Review", "Origin", "Self-reported", "Manually added", "Overlaps another entry", "Note"], body));
}

/** Who signed up to attend each event in a season, with the note they left. Admin only. */
export async function exportRsvps(seasonId: string, tz: string) {
  const season = await getSeason(seasonId);
  if (!season) return null;
  const rows = await db
    .select({ e: events, entry: signupEntries, name: users.name })
    .from(signupEntries)
    .innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId))
    .innerJoin(signupSheets, eq(signupSheets.id, signupSlots.sheetId))
    .innerJoin(events, eq(events.id, signupSheets.eventId))
    .innerJoin(users, eq(users.id, signupEntries.userId))
    .where(and(eq(events.seasonId, seasonId), eq(signupSlots.kind, "attend")))
    .orderBy(asc(events.startsAt), asc(users.name));
  const body = rows.map(({ e, entry, name }) => [e.title, formatInTz(e.startsAt, tz, "yyyy-MM-dd HH:mm"), e.cancelledAt ? "cancelled" : "", name, entry.note ?? "", entry.createdAt]);
  return csvResponse(`attending-${slug(season.name)}.csv`, toCsv(["Event", "Starts", "Status", "Member", "Note", "Signed up at"], body));
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
  const flagged = overlappingIds(rows.map((r) => r.s));
  const body = rows.map(({ s, eventTitle }) => [
    eventTitle ?? "Build season clock-in",
    formatInTz(s.clockInAt, tz, "yyyy-MM-dd HH:mm"),
    s.clockOutAt ? formatInTz(s.clockOutAt, tz, "yyyy-MM-dd HH:mm") : "",
    s.clockOutAt ? hoursCell((s.clockOutAt.getTime() - s.clockInAt.getTime()) / 3_600_000) : "",
    countsTowardHours(s) ? "yes" : "no",
    s.reviewState,
    s.origin === "backfill" ? "yes" : "no",
    flagged.has(s.id) ? "yes" : "no",
  ]);
  return csvResponse(`my-hours-${slug(season.name)}.csv`, toCsv(["What", "In", "Out", "Hours", "Counts toward hours", "Review", "Manually added", "Overlaps another entry"], body));
}

/** Every merch order line, one row each, with the text to print. Admin only. */
export async function exportShopOrders(tz: string) {
  const { shopOrderLines, shopOrders } = await import("@/db/schema");
  const rows = await db.select({ o: shopOrders, l: shopOrderLines }).from(shopOrderLines).innerJoin(shopOrders, eq(shopOrders.id, shopOrderLines.orderId)).orderBy(asc(shopOrders.createdAt), asc(shopOrderLines.itemName));
  const body = rows.map(({ o, l }) => [
    formatInTz(o.createdAt, tz, "yyyy-MM-dd HH:mm"),
    o.buyerName,
    o.buyerEmail,
    o.status,
    l.itemName,
    l.sizeLabel,
    l.qty,
    (l.unitPriceCents * l.qty) / 100,
    l.printText ?? "",
    o.payByAt ? formatInTz(o.payByAt, tz, "yyyy-MM-dd") : "",
    o.paidAt ? formatInTz(o.paidAt, tz, "yyyy-MM-dd") : "",
    o.deliveredAt ? formatInTz(o.deliveredAt, tz, "yyyy-MM-dd") : "",
  ]);
  return csvResponse("shop-orders.csv", toCsv(["Ordered", "Buyer", "Email", "Status", "Item", "Size", "Qty", "Line total ($)", "Print text", "Pay by", "Paid on", "Delivered on"], body));
}
