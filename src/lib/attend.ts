import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, signupEntries, signupSheets, signupSlots, users } from "@/db/schema";
import { claimSlot, leaveSlot, type Viewer } from "@/lib/signups";

/**
 * "Are you coming?" lives on the event's sign-up sheet as a special spot (kind `attend`). It replaced RSVPs: you're either
 * signed up for the event or you aren't. It has no practical limit, no waitlist, and follows the event's own times.
 */
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Makes the event's sheet and its "Attending" spot if they don't exist yet. Safe to call repeatedly and concurrently. */
export async function ensureAttendSlot(eventId: string): Promise<string | null> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event || !event.rsvpEnabled) return null;
  await db.insert(signupSheets).values({ eventId }).onConflictDoNothing();
  const [sheet] = await db.select({ id: signupSheets.id }).from(signupSheets).where(eq(signupSheets.eventId, eventId));
  await db
    .insert(signupSlots)
    .values({ sheetId: sheet!.id, title: "Attending", startsAt: event.startsAt, endsAt: event.endsAt, capacity: 500, audience: "members", kind: "attend", waitlistEnabled: false, position: -1 })
    .onConflictDoNothing();
  const [slot] = await db.select({ id: signupSlots.id }).from(signupSlots).where(and(eq(signupSlots.sheetId, sheet!.id), eq(signupSlots.kind, "attend")));
  return slot?.id ?? null;
}

/** "I'm going" / "I can't make it". `note` is optional and only leads and admins see it. */
export async function setAttending(viewer: Viewer, eventId: string, going: boolean, note?: string, now: Date = new Date()): Promise<Result> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) return { ok: false, error: "That event doesn't exist." };
  if (event.cancelledAt) return { ok: false, error: "This event was cancelled." };
  if (!event.rsvpEnabled) return { ok: false, error: "This event doesn't take sign-ups." };
  if (event.endsAt <= now) return { ok: false, error: "This event is over, so it can't be changed." };
  const slotId = await ensureAttendSlot(eventId);
  if (!slotId) return { ok: false, error: "This event doesn't take sign-ups." };
  const cleanNote = note?.trim() ? note.trim().replace(/\s+/g, " ").slice(0, 200) : null;

  if (!going) {
    const r = await leaveSlot(viewer, slotId, now);
    return r.ok ? { ok: true } : r;
  }
  const [mine] = await db.select({ id: signupEntries.id }).from(signupEntries).where(and(eq(signupEntries.slotId, slotId), eq(signupEntries.userId, viewer.id)));
  if (mine) {
    await db.update(signupEntries).set({ note: cleanNote }).where(eq(signupEntries.id, mine.id));
    return { ok: true };
  }
  const r = await claimSlot(viewer, slotId, now, note);
  return r.ok ? { ok: true } : r;
}

/** How many active people are going to each event. */
export async function attendingCounts(eventIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (eventIds.length === 0) return out;
  const rows = await db
    .select({ eventId: signupSheets.eventId, n: sql<number>`count(*)::int` })
    .from(signupEntries)
    .innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId))
    .innerJoin(signupSheets, eq(signupSheets.id, signupSlots.sheetId))
    .innerJoin(users, eq(users.id, signupEntries.userId))
    .where(and(inArray(signupSheets.eventId, eventIds), eq(signupSlots.kind, "attend"), eq(signupEntries.status, "confirmed"), eq(users.status, "active")))
    .groupBy(signupSheets.eventId);
  for (const r of rows) out.set(r.eventId, r.n);
  return out;
}

/** The events (out of `eventIds`) this person is going to. */
export async function myAttending(userId: string, eventIds: string[]): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();
  const rows = await db
    .select({ eventId: signupSheets.eventId })
    .from(signupEntries)
    .innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId))
    .innerJoin(signupSheets, eq(signupSheets.id, signupSlots.sheetId))
    .where(and(eq(signupEntries.userId, userId), eq(signupSlots.kind, "attend"), inArray(signupSheets.eventId, eventIds)));
  return new Set(rows.map((r) => r.eventId));
}

/** My note on the "I'm going" spot, if I'm going. */
export async function myAttendNote(userId: string, eventId: string): Promise<{ going: boolean; note: string | null }> {
  const [row] = await db
    .select({ note: signupEntries.note })
    .from(signupEntries)
    .innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId))
    .innerJoin(signupSheets, eq(signupSheets.id, signupSlots.sheetId))
    .where(and(eq(signupEntries.userId, userId), eq(signupSlots.kind, "attend"), eq(signupSheets.eventId, eventId)));
  return { going: Boolean(row), note: row?.note ?? null };
}

/** Lead/admin view: who's going (with their notes), and active people who haven't signed up. Never exposes email. */
export async function attendLists(eventId: string) {
  const going = await db
    .select({ userId: users.id, name: users.name, note: signupEntries.note })
    .from(signupEntries)
    .innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId))
    .innerJoin(signupSheets, eq(signupSheets.id, signupSlots.sheetId))
    .innerJoin(users, eq(users.id, signupEntries.userId))
    .where(and(eq(signupSheets.eventId, eventId), eq(signupSlots.kind, "attend"), eq(signupEntries.status, "confirmed"), eq(users.status, "active")))
    .orderBy(asc(users.name));
  const goingIds = new Set(going.map((g) => g.userId));
  const everyone = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.status, "active"), inArray(users.role, ["member", "lead", "admin"]), ne(users.role, "parent")))
    .orderBy(asc(users.name));
  return { going, notYet: everyone.filter((u) => !goingIds.has(u.id)) };
}
