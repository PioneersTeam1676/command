import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Db } from "@/db";
import { events, groups, signupAudiences, signupEntries, signupSheets, signupSlotGroups, signupSlots, users, type Role } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";
import { groupIdsForUser } from "@/lib/groups";
import { notify } from "@/lib/notify";
import { approvedStudentIds } from "@/lib/parent-scope";
import { getSettings } from "@/lib/settings";
import { CLOSED_MESSAGE, claimGate, roleFitsAudience, slotClosedReason, slotsOverlap, type GateResult, type SlotClosedReason } from "@/lib/signups-rules";
import { formatInTz, fromDatetimeLocal } from "@/lib/time";

export type SheetRow = typeof signupSheets.$inferSelect;
export type SlotRow = typeof signupSlots.$inferSelect;
export type EntryRow = typeof signupEntries.$inferSelect;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };
export type Viewer = { id: string; role: Role };

const MAX_SLOT_MS = 72 * 3_600_000;

/** Parents live in their own route tree, so a link to the event has to differ by role. */
export const signupUrl = (role: Role, eventId: string) => (role === "parent" ? `/parent/calendar/${eventId}` : `/calendar/${eventId}`);
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const slotFormSchema = z.object({
  title: z.string().trim().min(1, "Give the shift a name.").max(120),
  description: z.string().trim().max(1000).optional().transform((v) => v || undefined),
  startsAt: z.string().regex(LOCAL, "Choose a start time."),
  endsAt: z.string().regex(LOCAL, "Choose an end time."),
  capacity: z.coerce.number({ error: "Enter how many people you need." }).int("Use a whole number.").min(1, "Need at least 1 person.").max(500, "That's too many for one shift."),
  audience: z.enum(signupAudiences).default("anyone"),
  // A checkbox: absent from the form data when unticked.
  waitlistEnabled: z.string().optional().transform((v) => v === "on"),
  // Blank means "no priority window". Only meaningful together with groups.
  opensToAllAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().regex(LOCAL, "Choose a valid time.").optional()),
});
export type SlotFormInput = Omit<z.infer<typeof slotFormSchema>, "description" | "opensToAllAt" | "waitlistEnabled"> & {
  description?: string;
  /** Defaults to true. */
  waitlistEnabled?: boolean;
  opensToAllAt?: string;
  /** Groups the shift is reserved for. Empty or missing means open to everyone the audience allows. */
  groupIds?: string[];
};

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

/** Checks the group list and priority window together, since either is meaningless without the other. */
async function resolveAccess(
  input: Pick<SlotFormInput, "groupIds" | "opensToAllAt">,
  times: { endsAt: Date },
  tz: string,
): Promise<Result<{ groupIds: string[]; opensToAllAt: Date | null }>> {
  const groupIds = [...new Set(input.groupIds ?? [])];
  if (groupIds.length > 0) {
    const found = await db.select({ id: groups.id }).from(groups).where(inArray(groups.id, groupIds));
    if (found.length !== groupIds.length) return { ok: false, error: "One of those groups no longer exists. Reload and try again.", field: "groupIds" };
  }
  if (!input.opensToAllAt) return { ok: true, groupIds, opensToAllAt: null };
  if (groupIds.length === 0) return { ok: false, error: "Pick the group that gets first access, or clear this time.", field: "opensToAllAt" };
  let opens: Date;
  try {
    opens = fromDatetimeLocal(input.opensToAllAt, tz);
  } catch {
    return { ok: false, error: "That time isn't valid.", field: "opensToAllAt" };
  }
  if (opens >= times.endsAt) return { ok: false, error: "Open it to everyone before the shift ends.", field: "opensToAllAt" };
  return { ok: true, groupIds, opensToAllAt: opens };
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
  const { timezone } = await getSettings();
  const times = parseTimes(input, timezone);
  if (!times.ok) return times;
  const access = await resolveAccess(input, times, timezone);
  if (!access.ok) return access;
  const [last] = await db
    .select({ next: sql<number>`coalesce(max(${signupSlots.position}), -1) + 1` })
    .from(signupSlots)
    .where(eq(signupSlots.sheetId, sheetId));
  const next = last?.next ?? 0;
  return db.transaction(async (tx): Promise<Result<{ id: string }>> => {
    const [row] = await tx
      .insert(signupSlots)
      .values({ sheetId, title: input.title, description: input.description ?? null, startsAt: times.startsAt, endsAt: times.endsAt, capacity: input.capacity, audience: input.audience, opensToAllAt: access.opensToAllAt, waitlistEnabled: input.waitlistEnabled ?? true, position: next })
      .returning();
    if (access.groupIds.length > 0) await tx.insert(signupSlotGroups).values(access.groupIds.map((groupId) => ({ slotId: row!.id, groupId })));
    await audit(
      { actorId, action: "signup.slot_create", targetType: "signup_slot", targetId: row!.id, after: { title: row!.title, capacity: row!.capacity, audience: row!.audience, startsAt: row!.startsAt, endsAt: row!.endsAt, groupIds: access.groupIds, opensToAllAt: row!.opensToAllAt } },
      tx,
    );
    return { ok: true, id: row!.id };
  });
}

export async function updateSlot(actorId: string, slotId: string, input: SlotFormInput): Promise<Result> {
  const { timezone } = await getSettings();
  const times = parseTimes(input, timezone);
  if (!times.ok) return times;
  const access = await resolveAccess(input, times, timezone);
  if (!access.ok) return access;
  const outcome = await db.transaction(async (tx): Promise<Result<{ promoted: Promoted[]; slot?: SlotRow }>> => {
    const [before] = await tx.select().from(signupSlots).where(eq(signupSlots.id, slotId)).for("update");
    if (!before) return { ok: false, error: "That shift doesn't exist." };
    if (before.cancelledAt) return { ok: false, error: "Cancelled shifts can't be edited." };
    const [held] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(signupEntries)
      .where(and(eq(signupEntries.slotId, slotId), eq(signupEntries.status, "confirmed")));
    const n = held?.n ?? 0;
    if (input.capacity < n) return { ok: false, error: `${n} people already hold this shift. Remove some of them before lowering it to ${input.capacity}.`, field: "capacity" };
    const beforeGroups = (await tx.select({ id: signupSlotGroups.groupId }).from(signupSlotGroups).where(eq(signupSlotGroups.slotId, slotId))).map((g) => g.id);
    const [after] = await tx
      .update(signupSlots)
      .set({ title: input.title, description: input.description ?? null, startsAt: times.startsAt, endsAt: times.endsAt, capacity: input.capacity, audience: input.audience, opensToAllAt: access.opensToAllAt, waitlistEnabled: input.waitlistEnabled ?? before.waitlistEnabled })
      .where(eq(signupSlots.id, slotId))
      .returning();
    await tx.delete(signupSlotGroups).where(eq(signupSlotGroups.slotId, slotId));
    if (access.groupIds.length > 0) await tx.insert(signupSlotGroups).values(access.groupIds.map((groupId) => ({ slotId, groupId })));
    await audit(
      {
        actorId,
        action: "signup.slot_update",
        targetType: "signup_slot",
        targetId: slotId,
        before: { title: before.title, capacity: before.capacity, audience: before.audience, startsAt: before.startsAt, endsAt: before.endsAt, groupIds: beforeGroups, opensToAllAt: before.opensToAllAt },
        after: { title: after!.title, capacity: after!.capacity, audience: after!.audience, startsAt: after!.startsAt, endsAt: after!.endsAt, groupIds: access.groupIds, opensToAllAt: after!.opensToAllAt, waitlistEnabled: after!.waitlistEnabled },
      },
      tx,
    );
    // More room than before: pull people off the waitlist.
    const promoted = await promoteWaitlist(tx, after!);
    return { ok: true, promoted, slot: after! };
  });
  if (!outcome.ok) return outcome;
  if (outcome.slot) await notifyPromoted(outcome.slot, outcome.promoted);
  return { ok: true };
}

/** Cancels a shift and tells everyone who held a place on it. */
export async function cancelSlot(actorId: string, slotId: string): Promise<Result> {
  const [slot] = await db.select().from(signupSlots).where(eq(signupSlots.id, slotId));
  if (!slot) return { ok: false, error: "That shift doesn't exist." };
  if (slot.cancelledAt) return { ok: true };
  await db.update(signupSlots).set({ cancelledAt: new Date() }).where(eq(signupSlots.id, slotId));
  await audit({ actorId, action: "signup.slot_cancel", targetType: "signup_slot", targetId: slotId, before: { title: slot.title } });
  const held = await db
    .select({ userId: signupEntries.userId, role: users.role })
    .from(signupEntries)
    .innerJoin(users, eq(users.id, signupEntries.userId))
    .where(eq(signupEntries.slotId, slotId));
  const sheet = (await db.select().from(signupSheets).where(eq(signupSheets.id, slot.sheetId)))[0]!;
  const { timezone } = await getSettings();
  for (const isParent of [false, true]) {
    await notify({
      userIds: held.filter((h) => (h.role === "parent") === isParent).map((h) => h.userId),
      type: "signup_change",
      title: `Shift cancelled: ${slot.title}`,
      body: formatInTz(slot.startsAt, timezone, "EEE MMM d, h:mm a"),
      url: signupUrl(isParent ? "parent" : "member", sheet.eventId),
      dedupeKey: `signup:${slotId}:cancelled`,
    }).catch(() => undefined);
  }
  return { ok: true };
}

// ---------- Claiming ----------

/**
 * Claim a place on a shift. Runs under a row lock on the slot, so two people racing for the last
 * place can't both get it, and the overlap check can't be beaten by a double tap.
 */
export type ClaimResult = Result<{ status: "confirmed" | "waitlisted"; /** 1-based place in the queue when waitlisted. */ position?: number }>;

export async function claimSlot(viewer: Viewer, slotId: string, now: Date = new Date()): Promise<ClaimResult> {
  const { timezone } = await getSettings();
  try {
    return await db.transaction(async (tx): Promise<ClaimResult> => {
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

      const slotGroupIds = (await tx.select({ id: signupSlotGroups.groupId }).from(signupSlotGroups).where(eq(signupSlotGroups.slotId, slotId))).map((g) => g.id);
      const gate = claimGate({ slotGroupIds, opensToAllAt: slot.opensToAllAt, userGroupIds: slotGroupIds.length ? await groupIdsForUser(viewer.id, tx) : [], now });
      if (gate.state === "group_only") return { ok: false, error: "This shift is reserved for a group you're not in." };
      if (gate.state === "early_access") return { ok: false, error: `A group has first pick of this shift. It opens to everyone on ${formatInTz(gate.opensAt, timezone, "EEE MMM d 'at' h:mm a")}.` };

      const [mine] = await tx.select().from(signupEntries).where(and(eq(signupEntries.slotId, slotId), eq(signupEntries.userId, viewer.id)));
      if (mine) return { ok: false, error: "You're already signed up for this shift." };

      const clash = await tx
        .select({ title: signupSlots.title, startsAt: signupSlots.startsAt, endsAt: signupSlots.endsAt })
        .from(signupEntries)
        .innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId))
        .where(and(eq(signupEntries.userId, viewer.id), eq(signupSlots.sheetId, slot.sheetId), ne(signupSlots.id, slotId), isNull(signupSlots.cancelledAt)));
      const overlapping = clash.find((c) => slotsOverlap(c, slot));
      if (overlapping) return { ok: false, error: `That overlaps with “${overlapping.title}”, which you already hold. Leave it first if you'd rather do this one.` };

      const [held] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(signupEntries)
        .where(and(eq(signupEntries.slotId, slotId), eq(signupEntries.status, "confirmed")));
      if ((held?.n ?? 0) >= slot.capacity) {
        if (!slot.waitlistEnabled) return { ok: false, error: "This shift is full." };
        await tx.insert(signupEntries).values({ slotId, userId: viewer.id, status: "waitlisted", source: "self" });
        const [ahead] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(signupEntries)
          .where(and(eq(signupEntries.slotId, slotId), eq(signupEntries.status, "waitlisted")));
        return { ok: true, status: "waitlisted", position: ahead?.n ?? 1 };
      }

      await tx.insert(signupEntries).values({ slotId, userId: viewer.id, status: "confirmed", source: "self" });
      return { ok: true, status: "confirmed" };
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "You're already signed up for this shift." };
    throw e;
  }
}

/**
 * Give a place back (or leave the waitlist). Members can do it until the shift starts; after that a
 * lead has to. A freed place goes to the next person on the waitlist.
 */
export async function leaveSlot(viewer: Viewer, slotId: string, now: Date = new Date()): Promise<Result> {
  const outcome = await db.transaction(async (tx): Promise<Result<{ promoted: Promoted[]; slot?: SlotRow }>> => {
    const [slot] = await tx.select().from(signupSlots).where(eq(signupSlots.id, slotId)).for("update");
    if (!slot) return { ok: false, error: "That shift doesn't exist." };
    const [sheet] = await tx.select().from(signupSheets).where(eq(signupSheets.id, slot.sheetId));
    const [mine] = await tx.select().from(signupEntries).where(and(eq(signupEntries.slotId, slotId), eq(signupEntries.userId, viewer.id)));
    if (!mine) return { ok: true, promoted: [] };
    if (sheet!.closedAt) return { ok: false, error: "Sign-ups are closed. Ask a lead to take you off." };
    if (slot.startsAt <= now) return { ok: false, error: "This shift has already started. Ask a lead to take you off." };
    await tx.delete(signupEntries).where(eq(signupEntries.id, mine.id));
    const promoted = mine.status === "confirmed" ? await promoteWaitlist(tx, slot) : [];
    return { ok: true, promoted, slot };
  });
  if (!outcome.ok) return outcome;
  if (outcome.slot) await notifyPromoted(outcome.slot, outcome.promoted);
  return { ok: true };
}

// ---------- Waitlist ----------

export type Promoted = { userId: string; entryId: string; role: Role };

/**
 * Fills any free places from the waitlist, oldest first. Call inside the transaction that freed the place,
 * with the slot row already locked. Someone who can no longer take the place (deactivated, audience
 * changed, or now clashing with a shift they hold) is skipped and stays queued rather than blocking the line.
 */
export async function promoteWaitlist(tx: Pick<Db, "select" | "update">, slot: SlotRow): Promise<Promoted[]> {
  if (slot.cancelledAt) return [];
  const [held] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(signupEntries)
    .where(and(eq(signupEntries.slotId, slot.id), eq(signupEntries.status, "confirmed")));
  let free = slot.capacity - (held?.n ?? 0);
  if (free <= 0) return [];
  const queue = await tx
    .select({ entryId: signupEntries.id, userId: signupEntries.userId, status: users.status, role: users.role })
    .from(signupEntries)
    .innerJoin(users, eq(users.id, signupEntries.userId))
    .where(and(eq(signupEntries.slotId, slot.id), eq(signupEntries.status, "waitlisted")))
    .orderBy(asc(signupEntries.createdAt), asc(signupEntries.id));
  const promoted: Promoted[] = [];
  for (const q of queue) {
    if (free <= 0) break;
    if (q.status !== "active" || !roleFitsAudience(q.role, slot.audience)) continue;
    const holds = await tx
      .select({ startsAt: signupSlots.startsAt, endsAt: signupSlots.endsAt })
      .from(signupEntries)
      .innerJoin(signupSlots, eq(signupSlots.id, signupEntries.slotId))
      .where(and(eq(signupEntries.userId, q.userId), eq(signupEntries.status, "confirmed"), eq(signupSlots.sheetId, slot.sheetId), ne(signupSlots.id, slot.id), isNull(signupSlots.cancelledAt)));
    if (holds.some((h) => slotsOverlap(h, slot))) continue;
    await tx.update(signupEntries).set({ status: "confirmed", promotedAt: new Date() }).where(eq(signupEntries.id, q.entryId));
    promoted.push({ userId: q.userId, entryId: q.entryId, role: q.role });
    free -= 1;
  }
  return promoted;
}

/** Tells people they got a place. Sent after the transaction commits, and never twice for one entry. */
export async function notifyPromoted(slot: SlotRow, promoted: Promoted[]) {
  if (promoted.length === 0) return;
  const [sheet] = await db.select({ eventId: signupSheets.eventId }).from(signupSheets).where(eq(signupSheets.id, slot.sheetId));
  const { timezone } = await getSettings();
  for (const p of promoted) {
    await notify({
      userIds: [p.userId],
      type: "signup_change",
      title: `You're in: ${slot.title}`,
      body: `A place opened up. ${formatInTz(slot.startsAt, timezone, "EEE MMM d, h:mm a")}`,
      url: signupUrl(p.role, sheet!.eventId),
      dedupeKey: `signup:${p.entryId}:promoted`,
    }).catch(() => undefined);
  }
}

// ---------- Reading ----------

/** `entryId` and `source` are only filled in for leads and admins, who manage the list. */
export type RosterEntry = { userId: string; name: string; entryId?: string; source?: string };

export type SlotView = {
  slot: SlotRow;
  /** Groups the shift is reserved for. */
  groups: { id: string; name: string }[];
  /** Whether this viewer can take it now, has to wait for the priority window to end, or is shut out. */
  gate: GateResult;
  filled: number;
  /** How many are queued for a place. */
  waitlisted: number;
  /** This viewer's 1-based place in the queue, when they're on it. */
  myPosition: number | null;
  mine: EntryRow | null;
  closed: SlotClosedReason | null;
  /** Names of people holding a place. Null for parents, who only see counts. */
  roster: RosterEntry[] | null;
  /** Who is queued, oldest first. Only for leads and admins. */
  queue: RosterEntry[] | null;
};

export type SignupView = { sheet: SheetRow; slots: SlotView[] };

export async function getSignupView(eventId: string, viewer: Viewer, now: Date = new Date()): Promise<SignupView | null> {
  const sheet = await getSheetByEvent(eventId);
  if (!sheet) return null;
  const [event] = await db.select({ cancelledAt: events.cancelledAt }).from(events).where(eq(events.id, eventId));
  const staff = viewer.role === "lead" || viewer.role === "admin";
  const all = await db.select().from(signupSlots).where(eq(signupSlots.sheetId, sheet.id)).orderBy(asc(signupSlots.startsAt), asc(signupSlots.position));
  const audienceOk = all.filter((s) => staff || (!s.cancelledAt && roleFitsAudience(viewer.role, s.audience)));
  if (audienceOk.length === 0) return { sheet, slots: [] };

  const slotGroups = await db
    .select({ slotId: signupSlotGroups.slotId, id: groups.id, name: groups.name })
    .from(signupSlotGroups)
    .innerJoin(groups, eq(groups.id, signupSlotGroups.groupId))
    .where(inArray(signupSlotGroups.slotId, audienceOk.map((s) => s.id)))
    .orderBy(asc(groups.name));
  const mineGroups = slotGroups.length ? await groupIdsForUser(viewer.id) : [];
  const gateOf = (slot: SlotRow) => {
    const gs = slotGroups.filter((g) => g.slotId === slot.id);
    return { groups: gs.map((g) => ({ id: g.id, name: g.name })), gate: claimGate({ slotGroupIds: gs.map((g) => g.id), opensToAllAt: slot.opensToAllAt, userGroupIds: mineGroups, now }) };
  };
  // Shifts reserved for a group for good are invisible to everyone outside it (leads and admins still see them).
  const visible = audienceOk.filter((s) => staff || gateOf(s).gate.state !== "group_only");
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
      const line = entries.filter((e) => e.entry.slotId === slot.id && e.entry.status === "waitlisted");
      const myIndex = line.findIndex((e) => e.entry.userId === viewer.id);
      return {
        slot,
        ...gateOf(slot),
        filled: here.length,
        waitlisted: line.length,
        myPosition: myIndex >= 0 ? myIndex + 1 : null,
        queue: staff ? line.map((e) => ({ userId: e.entry.userId, name: e.name, entryId: e.entry.id, source: e.entry.source })) : null,
        mine: entries.find((e) => e.entry.slotId === slot.id && e.entry.userId === viewer.id)?.entry ?? null,
        closed: slotClosedReason(slot, { sheetClosedAt: sheet.closedAt, eventCancelledAt: event?.cancelledAt ?? null }, now),
        roster: viewer.role === "parent" ? null : here.map((e) => ({ userId: e.entry.userId, name: e.name, ...(staff ? { entryId: e.entry.id, source: e.entry.source } : {}) })),
      };
    }),
  };
}
