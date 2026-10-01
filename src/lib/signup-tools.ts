import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { events, signupAudiences, signupSheets, signupSlotGroups, signupSlots } from "@/db/schema";
import { audit } from "@/lib/audit";
import { addSlot, createSheet, getSheetByEvent } from "@/lib/signups";
import { getSettings } from "@/lib/settings";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/time";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MAX_BULK = 60;

export const bulkSchema = z.object({
  title: z.string().trim().min(1, "Give the shifts a name.").max(120),
  startsAt: z.string().regex(LOCAL, "Choose when the first shift starts."),
  endsAt: z.string().regex(LOCAL, "Choose when the last shift ends."),
  minutes: z.coerce.number({ error: "Choose how long each shift is." }).int().min(15, "At least 15 minutes.").max(720, "At most 12 hours."),
  capacity: z.coerce.number({ error: "Enter how many people each shift needs." }).int("Use a whole number.").min(1, "Need at least 1 person.").max(500),
  audience: z.enum(signupAudiences).default("anyone"),
});
export type BulkInput = z.infer<typeof bulkSchema>;

/** "Every 2 hours from 9 to 5": makes a run of back-to-back shifts in one go (up to 60). */
export async function addSlotsBulk(actorId: string, sheetId: string, input: BulkInput): Promise<Result<{ count: number }>> {
  const { timezone } = await getSettings();
  let start: Date;
  let end: Date;
  try {
    start = fromDatetimeLocal(input.startsAt, timezone);
    end = fromDatetimeLocal(input.endsAt, timezone);
  } catch {
    return { ok: false, error: "Those times aren't valid.", field: "startsAt" };
  }
  if (end <= start) return { ok: false, error: "The last shift has to end after the first one starts.", field: "endsAt" };
  const step = input.minutes * 60_000;
  const count = Math.floor((end.getTime() - start.getTime()) / step);
  if (count < 1) return { ok: false, error: "That window is shorter than one shift.", field: "minutes" };
  if (count > MAX_BULK) return { ok: false, error: `That would make ${count} shifts. Make them longer, or the window shorter (limit ${MAX_BULK}).`, field: "minutes" };
  for (let i = 0; i < count; i++) {
    const s = new Date(start.getTime() + i * step);
    const e = new Date(s.getTime() + step);
    const r = await addSlot(actorId, sheetId, { title: input.title, startsAt: toDatetimeLocal(s, timezone), endsAt: toDatetimeLocal(e, timezone), capacity: input.capacity, audience: input.audience, kind: "shift" });
    if (!r.ok) return { ok: false, error: `Stopped after ${i} shifts: ${r.error}` };
  }
  return { ok: true, count };
}

/** Other events that have shifts or items to copy from, newest first. */
export async function copySources(excludeEventId: string, limit = 25) {
  const rows = await db
    .selectDistinct({ id: events.id, title: events.title, startsAt: events.startsAt })
    .from(signupSlots)
    .innerJoin(signupSheets, eq(signupSheets.id, signupSlots.sheetId))
    .innerJoin(events, eq(events.id, signupSheets.eventId))
    .where(and(ne(events.id, excludeEventId), ne(signupSlots.kind, "attend"), isNull(signupSlots.cancelledAt)))
    .orderBy(desc(events.startsAt))
    .limit(limit);
  return rows;
}

/**
 * Copies another event's shifts and items onto this one (nobody's names come along). Shifts keep their time of day
 * relative to the event's start, so a Saturday sheet copied to the next Saturday lines up.
 */
export async function copySheet(actorId: string, fromEventId: string, toEventId: string): Promise<Result<{ count: number }>> {
  if (fromEventId === toEventId) return { ok: false, error: "Pick a different event to copy from." };
  const [from] = await db.select().from(events).where(eq(events.id, fromEventId));
  const [to] = await db.select().from(events).where(eq(events.id, toEventId));
  if (!from || !to) return { ok: false, error: "That event doesn't exist." };
  if (to.cancelledAt) return { ok: false, error: "This event was cancelled." };
  const source = await getSheetByEvent(fromEventId);
  if (!source) return { ok: false, error: "That event has no sign-ups to copy." };
  const slots = await db
    .select()
    .from(signupSlots)
    .where(and(eq(signupSlots.sheetId, source.id), ne(signupSlots.kind, "attend"), isNull(signupSlots.cancelledAt)))
    .orderBy(asc(signupSlots.startsAt), asc(signupSlots.position));
  if (slots.length === 0) return { ok: false, error: "That event has no shifts or items to copy." };
  const made = await createSheet(actorId, toEventId);
  if (!made.ok) return made;
  const offset = to.startsAt.getTime() - from.startsAt.getTime();
  const groupRows = await db.select().from(signupSlotGroups).where(inArray(signupSlotGroups.slotId, slots.map((s) => s.id)));
  await db.transaction(async (tx) => {
    for (const s of slots) {
      const item = s.kind === "item";
      const [row] = await tx
        .insert(signupSlots)
        .values({
          sheetId: made.id,
          title: s.title,
          description: s.description,
          kind: s.kind,
          startsAt: item ? to.startsAt : new Date(s.startsAt.getTime() + offset),
          endsAt: item ? to.endsAt : new Date(s.endsAt.getTime() + offset),
          capacity: s.capacity,
          audience: s.audience,
          opensToAllAt: s.opensToAllAt ? new Date(s.opensToAllAt.getTime() + offset) : null,
          waitlistEnabled: s.waitlistEnabled,
          position: s.position,
        })
        .returning({ id: signupSlots.id });
      const gs = groupRows.filter((g) => g.slotId === s.id);
      if (gs.length) await tx.insert(signupSlotGroups).values(gs.map((g) => ({ slotId: row!.id, groupId: g.groupId })));
    }
    await audit({ actorId, action: "signup.sheet_copy", targetType: "event", targetId: toEventId, after: { fromEventId, count: slots.length } }, tx);
  });
  return { ok: true, count: slots.length };
}
