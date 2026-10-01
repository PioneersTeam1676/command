import { and, asc, eq, gt, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attendanceSessions, events, parentLinks, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { ensureAttendSlot } from "@/lib/attend";
import { queueGcalPush, type EventChangeKind } from "@/lib/gcal-sync";
import { notify } from "@/lib/notify";
import { getCurrentSeason, seasonForDate } from "@/lib/seasons";
import { getSettings } from "@/lib/settings";
import { fromDatetimeLocal, localDateOf, formatInTz } from "@/lib/time";

export type EventRow = typeof events.$inferSelect;

const MAX_DURATION_MS = 72 * 3_600_000;

export const eventFormSchema = z.object({
  title: z.string().trim().min(1, "Give the event a title.").max(120),
  description: z.string().trim().max(2000).optional().transform((v) => v || undefined),
  locationText: z.string().trim().max(200).optional().transform((v) => v || undefined),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a start time."),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose an end time."),
  verification: z.enum(["inherit", "none", "code"]).default("inherit"),
  // A checkbox: absent from the form data when unticked.
  rsvpEnabled: z.string().optional().transform((v) => v === "on"),
});
export type EventFormInput = Omit<z.infer<typeof eventFormSchema>, "description" | "locationText" | "rsvpEnabled"> & {
  description?: string;
  locationText?: string;
  /** Defaults to true (people can sign up to attend). */
  rsvpEnabled?: boolean;
};

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };

function parseTimes(input: EventFormInput, tz: string): Result<{ startsAt: Date; endsAt: Date }> {
  let startsAt: Date;
  let endsAt: Date;
  try {
    startsAt = fromDatetimeLocal(input.startsAt, tz);
    endsAt = fromDatetimeLocal(input.endsAt, tz);
  } catch {
    return { ok: false, error: "Those times aren't valid.", field: "startsAt" };
  }
  if (endsAt <= startsAt) return { ok: false, error: "The event has to end after it starts.", field: "endsAt" };
  if (endsAt.getTime() - startsAt.getTime() > MAX_DURATION_MS) return { ok: false, error: "Events can be at most 3 days long.", field: "endsAt" };
  return { ok: true, startsAt, endsAt };
}

/** Everyone who should hear about event changes: active members, plus parents of those members. */
export async function eventAudience(): Promise<string[]> {
  const members = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.status, "active"), inArray(users.role, ["member", "lead", "admin"])));
  const parents = await db
    .selectDistinct({ id: parentLinks.parentId })
    .from(parentLinks)
    .innerJoin(users, eq(users.id, parentLinks.studentId))
    .where(and(eq(parentLinks.status, "approved"), isNull(parentLinks.revokedAt), eq(users.status, "active")));
  const parentUsers = parents.length
    ? await db.select({ id: users.id }).from(users).where(and(inArray(users.id, parents.map((p) => p.id)), eq(users.status, "active")))
    : [];
  return [...new Set([...members.map((m) => m.id), ...parentUsers.map((p) => p.id)])];
}

const VERB: Record<EventChangeKind, string> = { created: "New event", updated: "Event changed", cancelled: "Event cancelled" };

export async function notifyEventChange(event: EventRow, kind: EventChangeKind, stamp: string) {
  const { timezone } = await getSettings();
  const when = formatInTz(event.startsAt, timezone, "EEE MMM d, h:mm a");
  await notify({
    userIds: await eventAudience(),
    type: "event_change",
    title: `${VERB[kind]}: ${event.title}`,
    body: when,
    url: `/calendar/${event.id}`,
    dedupeKey: `event:${event.id}:${kind}:${stamp}`,
  });
}

export async function createEvent(actorId: string, input: EventFormInput): Promise<Result<{ id: string }>> {
  const settings = await getSettings();
  const times = parseTimes(input, settings.timezone);
  if (!times.ok) return times;
  const season = await seasonForDate(localDateOf(times.startsAt, settings.timezone));
  const [row] = await db
    .insert(events)
    .values({
      seasonId: season.id,
      title: input.title,
      description: input.description ?? null,
      locationText: input.locationText ?? null,
      startsAt: times.startsAt,
      endsAt: times.endsAt,
      verification: input.verification,
      rsvpEnabled: input.rsvpEnabled ?? true,
      source: "app",
      createdBy: actorId,
    })
    .returning();
  if (row!.rsvpEnabled) await ensureAttendSlot(row!.id);
  await audit({ actorId, action: "event.create", targetType: "event", targetId: row!.id, after: { title: row!.title, startsAt: row!.startsAt, endsAt: row!.endsAt } });
  await queueGcalPush(row!.id, "created");
  await notifyEventChange(row!, "created", String(row!.createdAt.getTime())).catch(() => undefined);
  return { ok: true, id: row!.id };
}

export async function getEvent(id: string): Promise<EventRow | undefined> {
  const [e] = await db.select().from(events).where(eq(events.id, id));
  return e;
}

export async function updateEvent(actorId: string, id: string, input: EventFormInput): Promise<Result> {
  const before = await getEvent(id);
  if (!before) return { ok: false, error: "That event doesn't exist." };
  const settings = await getSettings();

  if (before.source === "imported") {
    // Imported events are read-only in Command except for the check-in verification method.
    const rsvpEnabled = input.rsvpEnabled ?? before.rsvpEnabled;
    await db.update(events).set({ verification: input.verification, rsvpEnabled }).where(eq(events.id, id));
    if (rsvpEnabled) await ensureAttendSlot(id);
    await audit({ actorId, action: "event.update_verification", targetType: "event", targetId: id, before: { verification: before.verification, rsvpEnabled: before.rsvpEnabled }, after: { verification: input.verification, rsvpEnabled } });
    return { ok: true };
  }
  if (before.cancelledAt) return { ok: false, error: "Cancelled events can't be edited." };
  const times = parseTimes(input, settings.timezone);
  if (!times.ok) return times;
  const [after] = await db
    .update(events)
    .set({
      title: input.title,
      description: input.description ?? null,
      locationText: input.locationText ?? null,
      startsAt: times.startsAt,
      endsAt: times.endsAt,
      verification: input.verification,
      rsvpEnabled: input.rsvpEnabled ?? before.rsvpEnabled,
    })
    .where(eq(events.id, id))
    .returning();
  if (after!.rsvpEnabled) await ensureAttendSlot(id);
  await audit({
    actorId,
    action: "event.update",
    targetType: "event",
    targetId: id,
    before: { title: before.title, description: before.description, locationText: before.locationText, startsAt: before.startsAt, endsAt: before.endsAt, verification: before.verification, rsvpEnabled: before.rsvpEnabled },
    after: { title: after!.title, description: after!.description, locationText: after!.locationText, startsAt: after!.startsAt, endsAt: after!.endsAt, verification: after!.verification, rsvpEnabled: after!.rsvpEnabled },
  });
  await queueGcalPush(id, "updated");
  await notifyEventChange(after!, "updated", String(Date.now())).catch(() => undefined);
  return { ok: true };
}

export async function cancelEvent(actorId: string, id: string): Promise<Result> {
  const before = await getEvent(id);
  if (!before) return { ok: false, error: "That event doesn't exist." };
  if (before.cancelledAt) return { ok: true };
  const [after] = await db.update(events).set({ cancelledAt: new Date() }).where(eq(events.id, id)).returning();
  await audit({ actorId, action: "event.cancel", targetType: "event", targetId: id, before: { title: before.title }, after: { cancelledAt: after!.cancelledAt } });
  await queueGcalPush(id, "cancelled");
  await notifyEventChange(after!, "cancelled", "cancelled").catch(() => undefined);
  return { ok: true };
}

/**
 * Permanently removes an event, its sign-ups and any attendance recorded against it (admin-only, enforced by
 * the action). Refused only when the event is linked to Google Calendar, where a local delete would leave
 * the Google copy or re-import it.
 */
export async function deleteEvent(actorId: string, id: string): Promise<Result> {
  const before = await getEvent(id);
  if (!before) return { ok: false, error: "That event doesn't exist." };
  if (before.gcalEventId) return { ok: false, error: "This event is linked to Google Calendar. Cancel it here, or delete it in Google Calendar." };
  await db.delete(events).where(eq(events.id, id));
  await audit({ actorId, action: "event.delete", targetType: "event", targetId: id, before: { title: before.title, startsAt: before.startsAt, endsAt: before.endsAt } });
  return { ok: true };
}

/** Events whose start falls in [from, to). Includes cancelled ones (they stay visible, struck through). */
export async function listEventsBetween(from: Date, to: Date): Promise<EventRow[]> {
  return db.select().from(events).where(and(gte(events.startsAt, from), lt(events.startsAt, to))).orderBy(asc(events.startsAt));
}

export async function listUpcomingEvents(now: Date, limit = 50): Promise<EventRow[]> {
  return db.select().from(events).where(gt(events.endsAt, now)).orderBy(asc(events.startsAt)).limit(limit);
}

export async function eventsForSeason(seasonId: string): Promise<EventRow[]> {
  return db.select().from(events).where(eq(events.seasonId, seasonId)).orderBy(asc(events.startsAt));
}

export { getCurrentSeason };

export const isOver = (event: Pick<EventRow, "endsAt">, now: Date = new Date()) => event.endsAt <= now;

/** Sensible defaults for the "new event" form: next full hour, two hours long, in the team timezone. */
export function defaultEventTimes(tz: string, now: Date = new Date()) {
  const start = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
  const end = new Date(start.getTime() + 2 * 3_600_000);
  return { startsAt: formatInTz(start, tz, "yyyy-MM-dd'T'HH:mm"), endsAt: formatInTz(end, tz, "yyyy-MM-dd'T'HH:mm") };
}
