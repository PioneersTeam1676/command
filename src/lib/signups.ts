import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { events, signupAudiences, signupEntries, signupSheets, signupSlots, users, type Role } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";
import { notify } from "@/lib/notify";
import { approvedStudentIds } from "@/lib/parent-scope";
import { getSettings } from "@/lib/settings";
import { CLOSED_MESSAGE, roleFitsAudience, slotClosedReason, slotsOverlap, type SlotClosedReason } from "@/lib/signups-rules";
import { formatInTz, fromDatetimeLocal } from "@/lib/time";

export type SheetRow = typeof signupSheets.$inferSelect;
export type SlotRow = typeof signupSlots.$inferSelect;
export type EntryRow = typeof signupEntries.$inferSelect;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };
export type Viewer = { id: string; role: Role };

const MAX_SLOT_MS = 72 * 3_600_000;
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const slotFormSchema = z.object({
  title: z.string().trim().min(1, "Give the shift a name.").max(120),
  description: z.string().trim().max(1000).optional().transform((v) => v || undefined),
  startsAt: z.string().regex(LOCAL, "Choose a start time."),
  endsAt: z.string().regex(LOCAL, "Choose an end time."),
  capacity: z.coerce.number({ error: "Enter how many people you need." }).int("Use a whole number.").min(1, "Need at least 1 person.").max(500, "That's too many for one shift."),
  audience: z.enum(signupAudiences).default("anyone"),
});
export type SlotFormInput = Omit<z.infer<typeof slotFormSchema>, "description"> & { description?: string };

function parseTimes(input: Pick<SlotFormInput, "startsAt" | "endsAt">, tz: string): Result<{ startsAt: Date; endsAt: Date }> {
  let startsAt: Date;
  let endsAt: Date;
  try {
    startsAt = fromDatetimeLocal(input.startsAt, tz);
    endsAt = fromDatetimeLocal(input.endsAt, tz);
  } catch {
    return { ok: false, error: "Those times aren't valid.", field: "startsAt" };
  }
  if (endsAt <= startsAt) return { ok: false, error: "The shift has to end after it starts.", field: "endsAt" };
  if (endsAt.getTime() - startsAt.getTime() > MAX_SLOT_MS) return { ok: false, error: "Shifts can be at most 3 days long.", field: "endsAt" };
  return { ok: true, startsAt, endsAt };
}

// ---------- Sheets ----------

export async function getSheetByEvent(eventId: string): Promise<SheetRow | undefined> {
  const [s] = await db.select().from(signupSheets).where(eq(signupSheets.eventId, eventId));
  return s;
}

/** Creates the event's sign-up sheet. Safe to call twice: the second call returns the existing sheet. */
export async function createSheet(actorId: string, eventId: string): Promise<Result<{ id: string }>> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) return { ok: false, error: "That event doesn't exist." };
  if (event.cancelledAt) return { ok: false, error: "This event was cancelled." };
  const existing = await getSheetByEvent(eventId);
  if (existing) return { ok: true, id: existing.id };
  const [row] = await db.insert(signupSheets).values({ eventId, createdBy: actorId }).onConflictDoNothing().returning();
  if (!row) return { ok: true, id: (await getSheetByEvent(eventId))!.id };
  await audit({ actorId, action: "signup.sheet_create", targetType: "event", targetId: eventId });
  return { ok: true, id: row.id };
}

export async function setSheetClosed(actorId: string, sheetId: string, closed: boolean): Promise<Result> {
  const [sheet] = await db.select().from(signupSheets).where(eq(signupSheets.id, sheetId));
  if (!sheet) return { ok: false, error: "That sign-up sheet doesn't exist." };
  await db.update(signupSheets).set({ closedAt: closed ? new Date() : null }).where(eq(signupSheets.id, sheetId));
  await audit({ actorId, action: closed ? "signup.sheet_close" : "signup.sheet_reopen", targetType: "event", targetId: sheet.eventId });
  return { ok: true };
}

// ---------- Slots ----------

export async function addSlot(actorId: string, sheetId: string, input: SlotFormInput): Promise<Result<{ id: string }>> {
  const [sheet] = await db.select().from(signupSheets).where(eq(signupSheets.id, sheetId));
  if (!sheet) return { ok: false, error: "That sign-up sheet doesn't exist." };
  const times = parseTimes(input, (await getSettings()).timezone);
  if (!times.ok) return times;
  const [last] = await db
    .select({ next: sql<number>`coalesce(max(${signupSlots.position}), -1) + 1` })
    .from(signupSlots)
    .where(eq(signupSlots.sheetId, sheetId));
  const next = last?.next ?? 0;
  const [row] = await db
    .insert(signupSlots)
    .values({ sheetId, title: input.title, description: input.description ?? null, startsAt: times.startsAt, endsAt: times.endsAt, capacity: input.capacity, audience: input.audience, position: next })
    .returning();
  await audit({ actorId, action: "signup.slot_create", targetType: "signup_slot", targetId: row!.id, after: { title: row!.title, capacity: row!.capacity, audience: row!.audience, startsAt: row!.startsAt, endsAt: row!.endsAt } });
  return { ok: true, id: row!.id };
}

export async function updateSlot(actorId: string, slotId: string, input: SlotFormInput): Promise<Result> {
  const times = parseTimes(input, (await getSettings()).timezone);
  if (!times.ok) return times;
  return db.transaction(async (tx): Promise<Result> => {
    const [before] = await tx.select().from(signupSlots).where(eq(signupSlots.id, slotId)).for("update");
    if (!before) return { ok: false, error: "That shift doesn't exist." };
    if (before.cancelledAt) return { ok: false, error: "Cancelled shifts can't be edited." };
    const [held] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(signupEntries)
      .where(and(eq(signupEntries.slotId, slotId), eq(signupEntries.status, "confirmed")));
    const n = held?.n ?? 0;
    if (input.capacity < n) return { ok: false, error: `${n} people already hold this shift. Remove some of them before lowering it to ${input.capacity}.`, field: "capacity" };
    const [after] = await tx
      .update(signupSlots)
      .set({ title: input.title, description: input.description ?? null, startsAt: times.startsAt, endsAt: times.endsAt, capacity: input.capacity, audience: input.audience })
      .where(eq(signupSlots.id, slotId))
      .returning();
    await audit(
      {
        actorId,
        action: "signup.slot_update",
        targetType: "signup_slot",
        targetId: slotId,
        before: { title: before.title, capacity: before.capacity, audience: before.audience, startsAt: before.startsAt, endsAt: before.endsAt },
        after: { title: after!.title, capacity: after!.capacity, audience: after!.audience, startsAt: after!.startsAt, endsAt: after!.endsAt },
      },
      tx,
    );
    return { ok: true };
  });
}

/** Cancels a shift and tells everyone who held a place on it. */
export async function cancelSlot(actorId: string, slotId: string): Promise<Result> {
  const [slot] = await db.select().from(signupSlots).where(eq(signupSlots.id, slotId));
  if (!slot) return { ok: false, error: "That shift doesn't exist." };
  if (slot.cancelledAt) return { ok: true };
  await db.update(signupSlots).set({ cancelledAt: new Date() }).where(eq(signupSlots.id, slotId));
  await audit({ actorId, action: "signup.slot_cancel", targetType: "signup_slot", targetId: slotId, before: { title: slot.title } });
  const held = await db.select({ userId: signupEntries.userId }).from(signupEntries).where(eq(signupEntries.slotId, slotId));
  const sheet = (await db.select().from(signupSheets).where(eq(signupSheets.id, slot.sheetId)))[0]!;
  const { timezone } = await getSettings();
  await notify({
    userIds: held.map((h) => h.userId),
    type: "signup_change",
    title: `Shift cancelled: ${slot.title}`,
    body: formatInTz(slot.startsAt, timezone, "EEE MMM d, h:mm a"),
    url: `/calendar/${sheet.eventId}`,
    dedupeKey: `signup:${slotId}:cancelled`,
  }).catch(() => undefined);
  return { ok: true };
}

// ---------- Claiming ----------

/**
 * Claim a place on a shift. Runs under a row lock on the slot, so two people racing for the last
 * place can't both get it, and the overlap check can't be beaten by a double tap.
 */
export async function claimSlot(viewer: Viewer, slotId: string, now: Date = new Date()): Promise<Result<{ status: "confirmed" }>> {
  try {
    return await db.transaction(async (tx): Promise<Result<{ status: "confirmed" }>> => {
      const [slot] = await tx.select().from(signupSlots).where(eq(signupSlots.id, slotId)).for("update");
      if (!slot) return { ok: false, error: "That shift doesn't exist." };
      const [sheet] = await tx.select().from(signupSheets).where(eq(signupSheets.id, slot.sheetId));
      const [event] = await tx.select().from(events).where(eq(events.id, sheet!.eventId));
      const [user] = await tx.select({ status: users.status, role: users.role }).from(users).where(eq(users.id, viewer.id));
      if (!user || user.status !== "active") return { ok: false, error: "Your account can't sign up right now." };

      const closed = slotClosedReason(slot, { sheetClosedAt: sheet!.closedAt, eventCancelledAt: event!.cancelledAt }, now);
      if (closed) return { ok: false, error: CLOSED_MESSAGE[closed] };
      if (!roleFitsAudience(user.role, slot.audience)) {
        return { ok: false, error: slot.audience === "parents" ? "This shift is for parents." : "This shift is for team members." };
      }
      if (user.role === "parent" && (await approvedStudentIds(viewer.id, tx)).length === 0) {
        return { ok: false, error: "Your link to a student needs approval before you can sign up." };
      }

      const [mine] = await tx.select().from(signupEntries).where(and(eq(signupEntries.slotId, slotId), eq(signupEntries.userId, viewer.id)));
      if (mine) return { ok: false, error: "You're already signed up for this shift." };

      const clash = await tx
        .select({ title: signupSlots.title, startsAt: signupSlots.startsAt, endsAt: signupSlots.endsAt })
        .from(signupEntries)
        .innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId))
        .where(and(eq(signupEntries.userId, viewer.id), eq(signupSlots.sheetId, slot.sheetId), ne(signupSlots.id, slotId)));
      const overlapping = clash.find((c) => slotsOverlap(c, slot));
      if (overlapping) return { ok: false, error: `That overlaps with “${overlapping.title}”, which you already hold. Leave it first if you'd rather do this one.` };

      const [held] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(signupEntries)
        .where(and(eq(signupEntries.slotId, slotId), eq(signupEntries.status, "confirmed")));
      if ((held?.n ?? 0) >= slot.capacity) return { ok: false, error: "This shift is full." };

      await tx.insert(signupEntries).values({ slotId, userId: viewer.id, status: "confirmed", source: "self" });
      return { ok: true, status: "confirmed" };
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "You're already signed up for this shift." };
    throw e;
  }
}

/** Give a place back. Members can do it until the shift starts; after that a lead has to. */
export async function leaveSlot(viewer: Viewer, slotId: string, now: Date = new Date()): Promise<Result> {
  return db.transaction(async (tx): Promise<Result> => {
    const [slot] = await tx.select().from(signupSlots).where(eq(signupSlots.id, slotId)).for("update");
    if (!slot) return { ok: false, error: "That shift doesn't exist." };
    const [sheet] = await tx.select().from(signupSheets).where(eq(signupSheets.id, slot.sheetId));
    const [mine] = await tx.select().from(signupEntries).where(and(eq(signupEntries.slotId, slotId), eq(signupEntries.userId, viewer.id)));
    if (!mine) return { ok: true };
    if (sheet!.closedAt) return { ok: false, error: "Sign-ups are closed. Ask a lead to take you off." };
    if (slot.startsAt <= now) return { ok: false, error: "This shift has already started. Ask a lead to take you off." };
    await tx.delete(signupEntries).where(eq(signupEntries.id, mine.id));
    return { ok: true };
  });
}

// ---------- Reading ----------

export type SlotView = {
  slot: SlotRow;
  filled: number;
  mine: EntryRow | null;
  closed: SlotClosedReason | null;
  /** Names of people holding a place. Null for parents, who only see counts. */
  roster: { userId: string; name: string }[] | null;
};

export type SignupView = { sheet: SheetRow; slots: SlotView[] };

export async function getSignupView(eventId: string, viewer: Viewer, now: Date = new Date()): Promise<SignupView | null> {
  const sheet = await getSheetByEvent(eventId);
  if (!sheet) return null;
  const [event] = await db.select({ cancelledAt: events.cancelledAt }).from(events).where(eq(events.id, eventId));
  const staff = viewer.role === "lead" || viewer.role === "admin";
  const all = await db.select().from(signupSlots).where(eq(signupSlots.sheetId, sheet.id)).orderBy(asc(signupSlots.startsAt), asc(signupSlots.position));
  const visible = all.filter((s) => staff || (!s.cancelledAt && roleFitsAudience(viewer.role, s.audience)));
  if (visible.length === 0) return { sheet, slots: [] };

  const entries = await db
    .select({ entry: signupEntries, name: users.name })
    .from(signupEntries)
    .innerJoin(users, eq(users.id, signupEntries.userId))
    .where(inArray(signupEntries.slotId, visible.map((s) => s.id)))
    .orderBy(asc(signupEntries.createdAt));

  return {
    sheet,
    slots: visible.map((slot) => {
      const here = entries.filter((e) => e.entry.slotId === slot.id && e.entry.status === "confirmed");
      return {
        slot,
        filled: here.length,
        mine: entries.find((e) => e.entry.slotId === slot.id && e.entry.userId === viewer.id)?.entry ?? null,
        closed: slotClosedReason(slot, { sheetClosedAt: sheet.closedAt, eventCancelledAt: event?.cancelledAt ?? null }, now),
        roster: viewer.role === "parent" ? null : here.map((e) => ({ userId: e.entry.userId, name: e.name })),
      };
    }),
  };
}
