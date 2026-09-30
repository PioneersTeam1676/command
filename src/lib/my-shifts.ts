import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, parentLinks, signupEntries, signupSheets, signupSlotGroups, signupSlots, users, type Role } from "@/db/schema";
import { groupIdsForUser } from "@/lib/groups";
import type { SlotRow } from "@/lib/signups";
import { claimGate, roleFitsAudience, slotsOverlap } from "@/lib/signups-rules";

export type MyShift = {
  entryId: string;
  status: "confirmed" | "waitlisted";
  /** 1-based place in the queue when waitlisted. */
  position: number | null;
  slot: SlotRow;
  eventId: string;
  eventTitle: string;
  locationText: string | null;
  /** Members can leave until the shift starts, and not at all once a lead has closed the sheet. */
  canLeave: boolean;
};

const PAST_LIMIT = 20;

/** Everything one person holds or is queued for. Cancelled shifts and cancelled events aren't listed. */
export async function myShifts(userId: string, now: Date = new Date()): Promise<{ upcoming: MyShift[]; past: MyShift[] }> {
  const rows = await db
    .select({ entry: signupEntries, slot: signupSlots, sheetClosedAt: signupSheets.closedAt, eventId: events.id, eventTitle: events.title, locationText: events.locationText, eventCancelledAt: events.cancelledAt })
    .from(signupEntries)
    .innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId))
    .innerJoin(signupSheets, eq(signupSheets.id, signupSlots.sheetId))
    .innerJoin(events, eq(events.id, signupSheets.eventId))
    .where(and(eq(signupEntries.userId, userId), isNull(signupSlots.cancelledAt)))
    .orderBy(asc(signupSlots.startsAt));
  const live = rows.filter((r) => !r.eventCancelledAt);

  const queued = live.filter((r) => r.entry.status === "waitlisted" && r.slot.endsAt > now).map((r) => r.slot.id);
  const lines = queued.length
    ? await db
        .select({ slotId: signupEntries.slotId, userId: signupEntries.userId })
        .from(signupEntries)
        .where(and(inArray(signupEntries.slotId, queued), eq(signupEntries.status, "waitlisted")))
        .orderBy(asc(signupEntries.createdAt), asc(signupEntries.id))
    : [];

  const shape = (r: (typeof live)[number]): MyShift => ({
    entryId: r.entry.id,
    status: r.entry.status === "waitlisted" ? "waitlisted" : "confirmed",
    position: r.entry.status === "waitlisted" ? lines.filter((l) => l.slotId === r.slot.id).findIndex((l) => l.userId === userId) + 1 || null : null,
    slot: r.slot,
    eventId: r.eventId,
    eventTitle: r.eventTitle,
    locationText: r.locationText,
    canLeave: !r.sheetClosedAt && r.slot.startsAt > now,
  });
  return {
    upcoming: live.filter((r) => r.slot.endsAt > now).map(shape),
    past: live.filter((r) => r.slot.endsAt <= now && r.entry.status === "confirmed").map(shape).reverse().slice(0, PAST_LIMIT),
  };
}

export type OpenShift = { slot: SlotRow; eventId: string; eventTitle: string; spotsLeft: number; waitlist: boolean };

/**
 * Shifts this person could take right now: on an open sheet for a live event, not over or cancelled,
 * allowed by the audience and the group gate, not already theirs, not clashing with something they hold,
 * and either with room or with a waitlist to join. Parents need an approved student link.
 */
export async function openShiftsFor(viewer: { id: string; role: Role }, now: Date = new Date()): Promise<OpenShift[]> {
  if (viewer.role === "parent") {
    const [linked] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(parentLinks)
      .innerJoin(users, eq(users.id, parentLinks.studentId))
      .where(and(eq(parentLinks.parentId, viewer.id), eq(parentLinks.status, "approved"), isNull(parentLinks.revokedAt), eq(users.status, "active")));
    if ((linked?.n ?? 0) === 0) return [];
  }
  const rows = await db
    .select({ slot: signupSlots, sheetId: signupSheets.id, eventId: events.id, eventTitle: events.title })
    .from(signupSlots)
    .innerJoin(signupSheets, eq(signupSheets.id, signupSlots.sheetId))
    .innerJoin(events, eq(events.id, signupSheets.eventId))
    .where(and(isNull(signupSlots.cancelledAt), isNull(signupSheets.closedAt), isNull(events.cancelledAt), gt(signupSlots.endsAt, now)))
    .orderBy(asc(signupSlots.startsAt));
  const fits = rows.filter((r) => roleFitsAudience(viewer.role, r.slot.audience));
  if (fits.length === 0) return [];
  const ids = fits.map((r) => r.slot.id);

  const counts = await db
    .select({ slotId: signupEntries.slotId, n: sql<number>`count(*)::int` })
    .from(signupEntries)
    .where(and(inArray(signupEntries.slotId, ids), eq(signupEntries.status, "confirmed")))
    .groupBy(signupEntries.slotId);
  const mine = await db
    .select({ slotId: signupEntries.slotId, sheetId: signupSlots.sheetId, startsAt: signupSlots.startsAt, endsAt: signupSlots.endsAt })
    .from(signupEntries)
    .innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId))
    .where(and(eq(signupEntries.userId, viewer.id), isNull(signupSlots.cancelledAt)));
  const slotGroups = await db.select({ slotId: signupSlotGroups.slotId, groupId: signupSlotGroups.groupId }).from(signupSlotGroups).where(inArray(signupSlotGroups.slotId, ids));
  const myGroups = slotGroups.length ? await groupIdsForUser(viewer.id) : [];

  const out: OpenShift[] = [];
  for (const r of fits) {
    if (mine.some((m) => m.slotId === r.slot.id)) continue;
    if (mine.some((m) => m.sheetId === r.sheetId && slotsOverlap(m, r.slot))) continue;
    const gate = claimGate({ slotGroupIds: slotGroups.filter((g) => g.slotId === r.slot.id).map((g) => g.groupId), opensToAllAt: r.slot.opensToAllAt, userGroupIds: myGroups, now });
    if (gate.state !== "open") continue;
    const spotsLeft = Math.max(r.slot.capacity - (counts.find((c) => c.slotId === r.slot.id)?.n ?? 0), 0);
    if (spotsLeft === 0 && !r.slot.waitlistEnabled) continue;
    out.push({ slot: r.slot, eventId: r.eventId, eventTitle: r.eventTitle, spotsLeft, waitlist: spotsLeft === 0 });
  }
  return out;
}

/** Per-event badges for the calendar: shifts you can take, and shifts you hold. */
export async function calendarShiftInfo(viewer: { id: string; role: Role }, now: Date = new Date()): Promise<Map<string, { open: number; mine: number }>> {
  const [open, mine] = await Promise.all([openShiftsFor(viewer, now), myShifts(viewer.id, now)]);
  const out = new Map<string, { open: number; mine: number }>();
  const at = (id: string) => out.get(id) ?? { open: 0, mine: 0 };
  for (const o of open) out.set(o.eventId, { ...at(o.eventId), open: at(o.eventId).open + 1 });
  for (const m of mine.upcoming) if (m.status === "confirmed") out.set(m.eventId, { ...at(m.eventId), mine: at(m.eventId).mine + 1 });
  return out;
}
