import { and, asc, desc, eq, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { attendanceSessions, clientActions, events, seasons, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { verifyCode } from "@/lib/checkin-code";
import { validateClientTime } from "@/lib/client-time";
import { isUniqueViolation } from "@/lib/db-errors";
import { hit } from "@/lib/auth/rate-limit";
import { getCheckinSecret } from "@/lib/checkin";
import { overlaps } from "@/lib/hours";
import { notify } from "@/lib/notify";
import { seasonForDate, type Season } from "@/lib/seasons";
import { getSettings, type TeamSettings } from "@/lib/settings";
import { fromDatetimeLocal, inBuildSeason, localDateOf, localToUtc, formatInTz } from "@/lib/time";

export type Session = typeof attendanceSessions.$inferSelect;
export type Origin = "live" | "offline_synced" | "backfill" | "admin";

export type Fail = { ok: false; error: string; conflict?: boolean };
export type Res<T = object> = ({ ok: true } & T) | Fail;
const fail = (error: string, conflict = false): Fail => ({ ok: false, error, conflict });

export const EVENT_CLOCKIN_LEAD_MS = 30 * 60_000;
export const MAX_SESSION_MS = 16 * 3_600_000;

/** When open sessions for a given local date are automatically closed. */
export const autoCloseAt = (localDate: string, s: Pick<TeamSettings, "timezone" | "autoClockoutTime">) =>
  localToUtc(localDate, s.autoClockoutTime.slice(0, 5), s.timezone);

/**
 * When an open (non-event) session is auto-closed. Normal sessions close at the daily cutoff.
 * Off-hours sessions (started outside build season or after the cutoff, awaiting approval) get the
 * 16 hour cap instead, since the cutoff has already passed or doesn't apply to them.
 */
export const openSessionCloseAt = (
  s: Pick<Session, "localDate" | "clockInAt" | "reviewState">,
  settings: Pick<TeamSettings, "timezone" | "autoClockoutTime">,
) => {
  const cutoff = autoCloseAt(s.localDate, settings);
  return s.reviewState === "pending_approval" || s.clockInAt >= cutoff ? new Date(s.clockInAt.getTime() + MAX_SESSION_MS) : cutoff;
};

export const eventAutoCloseAt = (event: { endsAt: Date }, s: Pick<TeamSettings, "eventAutocloseGraceMinutes">) =>
  new Date(event.endsAt.getTime() + s.eventAutocloseGraceMinutes * 60_000);

export const effectiveVerification = (event: { verification: string }, s: Pick<TeamSettings, "defaultCheckinVerification">): "none" | "code" =>
  (event.verification === "inherit" ? s.defaultCheckinVerification : event.verification) === "code" ? "code" : "none";

type Timing = { now: Date; clientTime?: Date | string | number | null };

/** Live taps use the server clock. Offline-synced taps use the validated device time. */
function resolveTime(t: Timing, origin: Origin): Res<{ at: Date; client: Date | null }> {
  if (origin !== "offline_synced") {
    const client = t.clientTime != null ? new Date(t.clientTime) : null;
    return { ok: true, at: t.now, client: client && !Number.isNaN(client.getTime()) ? client : null };
  }
  const v = validateClientTime(t.clientTime, t.now);
  if (!v.ok) return fail(v.message);
  return { ok: true, at: v.time, client: v.time };
}

// ---------------------------------------------------------------- open clock-in

export async function clockInOpen(userId: string, t: Timing, origin: Origin = "live"): Promise<Res<{ session: Session; offHours: boolean }>> {
  const time = resolveTime(t, origin);
  if (!time.ok) return time;
  const settings = await getSettings();
  const localDate = localDateOf(time.at, settings.timezone);
  const season = await seasonForDate(localDate);
  // Anyone can clock in at any time. Outside build season, or after the daily cutoff, the time waits for a lead's approval.
  const offHours = !inBuildSeason(localDate, season) || time.at >= autoCloseAt(localDate, settings);
  try {
    const [row] = await db
      .insert(attendanceSessions)
      .values({
        userId,
        seasonId: season.id,
        kind: "open",
        localDate,
        clockInAt: time.at,
        origin,
        reviewState: offHours ? "pending_approval" : "none",
        clientTimeIn: time.client,
        serverTimeIn: t.now,
      })
      .returning();
    return { ok: true, session: row!, offHours };
  } catch (e) {
    if (isUniqueViolation(e)) return fail("You're already clocked in.", true);
    throw e;
  }
}

async function closeSession(session: Session, out: Date, opts: { origin: Origin; now: Date; client: Date | null; auto?: boolean; note?: string | null }): Promise<Session | undefined> {
  const [row] = await db
    .update(attendanceSessions)
    .set({
      clockOutAt: out,
      ...(opts.note ? { note: opts.note } : {}),
      status: opts.auto ? "auto_closed" : "closed",
      reviewState: opts.auto ? "needs_review" : session.reviewState,
      clientTimeOut: opts.client,
      serverTimeOut: opts.now,
      // A tap made offline keeps the strongest provenance flag.
      origin: opts.origin === "offline_synced" && session.origin === "live" ? "offline_synced" : session.origin,
    })
    .where(and(eq(attendanceSessions.id, session.id), eq(attendanceSessions.status, "open")))
    .returning();
  return row;
}

export async function clockOutOpen(userId: string, t: Timing, origin: Origin = "live", rawNote?: string | null): Promise<Res<{ session: Session; autoClosed: boolean }>> {
  const time = resolveTime(t, origin);
  if (!time.ok) return time;
  const settings = await getSettings();
  const note = settings.clockoutNoteEnabled ? rawNote?.trim().slice(0, 300) || null : null;
  if (settings.clockoutNoteEnabled && settings.clockoutNoteRequired && !note) return fail("Add a quick note about what you did before clocking out.");
  const [open] = await db
    .select()
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.userId, userId), eq(attendanceSessions.kind, "open"), eq(attendanceSessions.status, "open")))
    .orderBy(desc(attendanceSessions.clockInAt))
    .limit(1);
  if (!open) return fail("You're not clocked in, so there's nothing to clock out of.", true);
  if (time.at <= open.clockInAt) return fail("That clock-out is before your clock-in. Ask a lead to fix your time.", true);

  const cutoff = openSessionCloseAt(open, settings);
  if (time.at >= cutoff) {
    // The nightly sweep hasn't run yet: close at the cutoff, flagged, exactly as the sweep would.
    const row = await closeSession(open, cutoff, { origin, now: t.now, client: time.client, auto: true, note });
    return { ok: true, session: row ?? open, autoClosed: true };
  }
  const row = await closeSession(open, time.at, { origin, now: t.now, client: time.client, note });
  if (!row) return fail("You were already clocked out.", true);
  return { ok: true, session: row, autoClosed: false };
}

// ---------------------------------------------------------------- event clock-in

export async function clockInEvent(userId: string, eventId: string, t: Timing & { code?: string }, origin: Origin = "live"): Promise<Res<{ session: Session }>> {
  const time = resolveTime(t, origin);
  if (!time.ok) return time;
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) return fail("We couldn't find that event.");
  if (event.cancelledAt) return fail("This event was cancelled.");
  const settings = await getSettings();
  const opensAt = new Date(event.startsAt.getTime() - EVENT_CLOCKIN_LEAD_MS);
  if (time.at < opensAt) return fail(`Check-in opens 30 minutes before the event, at ${formatInTz(opensAt, settings.timezone, "h:mm a")}.`);
  if (time.at >= event.endsAt) return fail("This event is over, so check-in has closed. You can add your time afterwards from your hours page.");

  if (effectiveVerification(event, settings) === "code") {
    if (origin === "offline_synced") return fail("This event needs a check-in code, so you have to be online to check in.");
    const attempts = await hit(`checkin:${userId}:${eventId}`, 10, 300);
    if (!attempts.allowed) return fail(`Too many wrong codes. Try again in ${Math.ceil(attempts.retryAfterSeconds / 60)} minute(s), or ask a lead to add you.`);
    const secret = await getCheckinSecret(eventId, false);
    if (!t.code || !secret || !verifyCode(secret, t.code, t.now)) {
      return fail("That code isn't right, or it has expired. Codes change every minute. Check the screen and try again.");
    }
  }

  try {
    const [row] = await db
      .insert(attendanceSessions)
      .values({
        userId,
        seasonId: event.seasonId,
        kind: "event",
        eventId,
        localDate: localDateOf(time.at, settings.timezone),
        clockInAt: time.at,
        origin,
        clientTimeIn: time.client,
        serverTimeIn: t.now,
      })
      .returning();
    return { ok: true, session: row! };
  } catch (e) {
    if (isUniqueViolation(e)) return fail("You've already checked in to this event.", true);
    throw e;
  }
}

export async function clockOutEvent(userId: string, eventId: string, t: Timing, origin: Origin = "live"): Promise<Res<{ session: Session; autoClosed: boolean }>> {
  const time = resolveTime(t, origin);
  if (!time.ok) return time;
  const settings = await getSettings();
  const [row] = await db
    .select({ session: attendanceSessions, event: events })
    .from(attendanceSessions)
    .innerJoin(events, eq(events.id, attendanceSessions.eventId))
    .where(and(eq(attendanceSessions.userId, userId), eq(attendanceSessions.eventId, eventId), eq(attendanceSessions.kind, "event")));
  if (!row) return fail("You haven't checked in to this event.", true);
  if (row.session.status !== "open") return fail("You were already clocked out of this event.", true);
  if (time.at <= row.session.clockInAt) return fail("That clock-out is before your check-in. Ask a lead to fix your time.", true);
  const cutoff = eventAutoCloseAt(row.event, settings);
  if (time.at >= cutoff) {
    const closed = await closeSession(row.session, cutoff, { origin, now: t.now, client: time.client, auto: true });
    return { ok: true, session: closed ?? row.session, autoClosed: true };
  }
  const closed = await closeSession(row.session, time.at, { origin, now: t.now, client: time.client });
  if (!closed) return fail("You were already clocked out of this event.", true);
  return { ok: true, session: closed, autoClosed: false };
}

// ---------------------------------------------------------------- idempotent wrapper for queued taps

/**
 * Runs `fn` once per client-generated action id. A retry (e.g. the phone lost signal after the
 * server applied the tap) gets the original answer instead of a confusing "already clocked in".
 */
export async function runOnce<T extends { ok: boolean }>(userId: string, actionId: string, fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  const claimed = await db.insert(clientActions).values({ id: `${userId}:${actionId}`, userId }).onConflictDoNothing().returning({ id: clientActions.id });
  if (claimed.length === 0) {
    const [prev] = await db.select().from(clientActions).where(eq(clientActions.id, `${userId}:${actionId}`));
    if (prev?.result) return prev.result as T;
    return { ok: false, error: "This tap is already being processed." };
  }
  const result = await fn();
  await db.update(clientActions).set({ result: JSON.parse(JSON.stringify(result)) }).where(eq(clientActions.id, `${userId}:${actionId}`));
  return result;
}

// ---------------------------------------------------------------- sweeps (auto clock-out)

/**
 * Close open sessions that ran past their cutoff. Idempotent: it only touches rows still `open`, and the
 * member notice is deduped per session, so overlapping ticks or restarts never double-process.
 */
export async function sweepAutoClose(now: Date = new Date()): Promise<{ open: number; event: number }> {
  const settings = await getSettings();
  let openClosed = 0;
  let eventClosed = 0;

  const openSessions = await db
    .select()
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.kind, "open"), eq(attendanceSessions.status, "open")));
  for (const s of openSessions) {
    const cutoff = openSessionCloseAt(s, settings);
    if (cutoff > now) continue;
    const closed = await closeSession(s, cutoff, { origin: s.origin as Origin, now, client: null, auto: true });
    if (!closed) continue;
    openClosed++;
    await noticeAutoClosed(closed, cutoff, settings.timezone, "your clock-in");
  }

  const eventSessions = await db
    .select({ session: attendanceSessions, event: events })
    .from(attendanceSessions)
    .innerJoin(events, eq(events.id, attendanceSessions.eventId))
    .where(and(eq(attendanceSessions.kind, "event"), eq(attendanceSessions.status, "open")));
  for (const { session, event } of eventSessions) {
    const cutoff = eventAutoCloseAt(event, settings);
    if (cutoff > now) continue;
    const closed = await closeSession(session, cutoff, { origin: session.origin as Origin, now, client: null, auto: true });
    if (!closed) continue;
    eventClosed++;
    await noticeAutoClosed(closed, cutoff, settings.timezone, event.title);
  }
  return { open: openClosed, event: eventClosed };
}

async function noticeAutoClosed(s: Session, at: Date, tz: string, what: string) {
  await notify({
    userIds: [s.userId],
    type: "auto_clockout",
    title: "You were clocked out automatically",
    body: `We closed ${what} at ${formatInTz(at, tz, "h:mm a")}. If that's not right, ask a lead to fix it.`,
    url: "/me/hours",
    dedupeKey: `auto:${s.id}`,
  }).catch(() => undefined);
}

// ---------------------------------------------------------------- backfill

export type BackfillInput =
  | { kind: "event"; eventId: string; inAt: string; outAt: string; note?: string }
  | { kind: "open"; date: string; inAt: string; outAt: string; note?: string };

async function seasonBelongs(user: { createdAt: Date }, season: Season, tz: string): Promise<boolean> {
  return season.endDate === null || localDateOf(user.createdAt, tz) <= season.endDate;
}

/** A member adds time for a past event or past build-season day. */
export async function addBackfill(userId: string, input: BackfillInput, now: Date = new Date()): Promise<Res<{ session: Session; pending: boolean }>> {
  const settings = await getSettings();
  const tz = settings.timezone;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return fail("Account not found.");

  let inAt: Date;
  let outAt: Date;
  try {
    inAt = fromDatetimeLocal(input.inAt, tz);
    outAt = fromDatetimeLocal(input.outAt, tz);
  } catch {
    return fail("Enter valid in and out times.");
  }
  if (outAt <= inAt) return fail("Your out time has to be after your in time.");
  if (outAt.getTime() - inAt.getTime() > MAX_SESSION_MS) return fail("That's longer than 16 hours. Split it into separate days or ask a lead.");
  if (outAt > now) return fail("You can only add time that has already happened.");

  let season: Season;
  let eventId: string | null = null;
  if (input.kind === "event") {
    const [event] = await db.select().from(events).where(eq(events.id, input.eventId));
    if (!event) return fail("We couldn't find that event.");
    if (event.cancelledAt) return fail("That event was cancelled.");
    if (event.endsAt > now) return fail("That event hasn't finished yet. Use the check-in on the Home screen.");
    const [s] = await db.select().from(seasons).where(eq(seasons.id, event.seasonId));
    season = s!;
    eventId = event.id;
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return fail("Choose a date.");
    if (input.date >= localDateOf(now, tz)) return fail("Choose a day that has already passed.");
    season = await seasonForDate(input.date);
    if (!inBuildSeason(input.date, season)) return fail("That day wasn't part of build season.");
  }
  if (!(await seasonBelongs(user, season, tz))) return fail("You weren't a member during that season.");

  // No overlapping time already on record (rejected entries don't count).
  const existing = await db
    .select({ clockInAt: attendanceSessions.clockInAt, clockOutAt: attendanceSessions.clockOutAt })
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.userId, userId), ne(attendanceSessions.reviewState, "rejected")));
  for (const e of existing) {
    const end = e.clockOutAt ?? now;
    if (overlaps([inAt, outAt], [e.clockInAt, end])) return fail("That overlaps time you've already recorded.");
  }

  const needsApproval = settings.backfillRequiresApproval;
  try {
    const [row] = await db
      .insert(attendanceSessions)
      .values({
        userId,
        seasonId: season.id,
        kind: input.kind,
        eventId,
        localDate: localDateOf(inAt, tz),
        clockInAt: inAt,
        clockOutAt: outAt,
        status: "closed",
        origin: "backfill",
        reviewState: needsApproval ? "pending_approval" : "none",
        selfReported: !needsApproval,
        note: input.note?.trim().slice(0, 300) || null,
        serverTimeIn: now,
        serverTimeOut: now,
      })
      .returning();
    return { ok: true, session: row!, pending: needsApproval };
  } catch (e) {
    if (isUniqueViolation(e)) return fail(input.kind === "event" ? "You already have time recorded for that event." : "You already have an open-session entry for that day.");
    throw e;
  }
}

// ---------------------------------------------------------------- review and edits (lead/admin)

export async function getSession(id: string): Promise<Session | undefined> {
  const [s] = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, id));
  return s;
}

const snapshot = (s: Session) => ({ clockInAt: s.clockInAt, clockOutAt: s.clockOutAt, status: s.status, reviewState: s.reviewState });

export async function acceptSession(actorId: string, id: string): Promise<Res> {
  const before = await getSession(id);
  if (!before) return fail("That entry doesn't exist.");
  if (before.reviewState !== "needs_review" && before.reviewState !== "pending_approval") return fail("That entry was already reviewed.");
  await db.update(attendanceSessions).set({ reviewState: "approved" }).where(eq(attendanceSessions.id, id));
  await audit({ actorId, action: before.reviewState === "pending_approval" ? "attendance.approve_backfill" : "attendance.accept", targetType: "attendance", targetId: id, before: snapshot(before), after: { reviewState: "approved" } });
  return { ok: true };
}

export async function rejectSession(actorId: string, id: string, reason?: string): Promise<Res> {
  const before = await getSession(id);
  if (!before) return fail("That entry doesn't exist.");
  if (before.reviewState === "rejected") return { ok: true };
  await db
    .update(attendanceSessions)
    .set({ reviewState: "rejected", note: reason?.trim() ? `${before.note ? `${before.note} · ` : ""}Rejected: ${reason.trim().slice(0, 200)}` : before.note })
    .where(eq(attendanceSessions.id, id));
  await audit({ actorId, action: before.reviewState === "pending_approval" ? "attendance.deny_backfill" : "attendance.reject", targetType: "attendance", targetId: id, before: snapshot(before), after: { reviewState: "rejected", reason: reason ?? null } });
  return { ok: true };
}

/** Change the times of an entry. Marks it edited and approved (a lead has looked at it). */
export async function editSessionTimes(actorId: string, id: string, times: { inAt?: Date; outAt: Date }, now: Date = new Date()): Promise<Res> {
  const before = await getSession(id);
  if (!before) return fail("That entry doesn't exist.");
  const inAt = times.inAt ?? before.clockInAt;
  if (times.outAt <= inAt) return fail("The end has to be after the start.");
  if (times.outAt > new Date(now.getTime() + 60_000)) return fail("The end can't be in the future.");
  if (times.outAt.getTime() - inAt.getTime() > MAX_SESSION_MS) return fail("That's longer than 16 hours.");
  await db
    .update(attendanceSessions)
    .set({ clockInAt: inAt, clockOutAt: times.outAt, status: "edited", reviewState: "approved", serverTimeOut: before.serverTimeOut ?? now })
    .where(eq(attendanceSessions.id, id));
  await audit({ actorId, action: "attendance.edit", targetType: "attendance", targetId: id, before: snapshot(before), after: { clockInAt: inAt, clockOutAt: times.outAt, status: "edited" } });
  return { ok: true };
}

/** Lead/admin ends someone's open session right now. */
export async function forceClockOut(actorId: string, id: string, now: Date = new Date()): Promise<Res> {
  const before = await getSession(id);
  if (!before) return fail("That entry doesn't exist.");
  if (before.status !== "open") return fail("They're already clocked out.");
  const out = now > before.clockInAt ? now : new Date(before.clockInAt.getTime() + 1000);
  await db
    .update(attendanceSessions)
    .set({ clockOutAt: out, status: "edited", reviewState: "approved", serverTimeOut: now })
    .where(and(eq(attendanceSessions.id, id), eq(attendanceSessions.status, "open")));
  await audit({ actorId, action: "attendance.force_clock_out", targetType: "attendance", targetId: id, before: snapshot(before), after: { clockOutAt: out, status: "edited" } });
  return { ok: true };
}

/** Lead/admin adds time for someone else. Counts immediately (a lead vouches for it). */
export async function addSessionForUser(
  actorId: string,
  input: { userId: string; kind: "open" | "event"; eventId?: string; inAt: Date; outAt: Date; note?: string },
  now: Date = new Date(),
): Promise<Res<{ session: Session }>> {
  const settings = await getSettings();
  if (input.outAt <= input.inAt) return fail("The end has to be after the start.");
  if (input.outAt > now) return fail("You can only add time that has already happened.");
  if (input.outAt.getTime() - input.inAt.getTime() > MAX_SESSION_MS) return fail("That's longer than 16 hours.");
  const localDate = localDateOf(input.inAt, settings.timezone);
  let seasonId: string;
  if (input.kind === "event") {
    if (!input.eventId) return fail("Choose an event.");
    const [event] = await db.select().from(events).where(eq(events.id, input.eventId));
    if (!event) return fail("We couldn't find that event.");
    seasonId = event.seasonId;
  } else {
    seasonId = (await seasonForDate(localDate)).id;
  }
  try {
    const [row] = await db
      .insert(attendanceSessions)
      .values({
        userId: input.userId,
        seasonId,
        kind: input.kind,
        eventId: input.kind === "event" ? input.eventId! : null,
        localDate,
        clockInAt: input.inAt,
        clockOutAt: input.outAt,
        status: "closed",
        origin: "admin",
        reviewState: "approved",
        note: input.note?.trim().slice(0, 300) || null,
        serverTimeIn: now,
        serverTimeOut: now,
      })
      .returning();
    await audit({ actorId, action: "attendance.add", targetType: "attendance", targetId: row!.id, after: { userId: input.userId, kind: input.kind, inAt: input.inAt, outAt: input.outAt } });
    return { ok: true, session: row! };
  } catch (e) {
    if (isUniqueViolation(e)) return fail("They already have an entry for that day or event. Edit it instead.");
    throw e;
  }
}

// ---------------------------------------------------------------- queries

export async function listMySessions(userId: string, seasonId: string) {
  return db
    .select({ session: attendanceSessions, eventTitle: events.title })
    .from(attendanceSessions)
    .leftJoin(events, eq(events.id, attendanceSessions.eventId))
    .where(and(eq(attendanceSessions.userId, userId), eq(attendanceSessions.seasonId, seasonId)))
    .orderBy(desc(attendanceSessions.clockInAt));
}

export async function reviewQueue() {
  return db
    .select({ session: attendanceSessions, userName: users.name, eventTitle: events.title })
    .from(attendanceSessions)
    .innerJoin(users, eq(users.id, attendanceSessions.userId))
    .leftJoin(events, eq(events.id, attendanceSessions.eventId))
    .where(inArray(attendanceSessions.reviewState, ["needs_review", "pending_approval"]))
    .orderBy(asc(attendanceSessions.clockInAt));
}

export async function openSessionsFor(userId: string) {
  return db
    .select({ session: attendanceSessions, eventTitle: events.title, eventEndsAt: events.endsAt })
    .from(attendanceSessions)
    .leftJoin(events, eq(events.id, attendanceSessions.eventId))
    .where(and(eq(attendanceSessions.userId, userId), eq(attendanceSessions.status, "open")));
}



/** Ended, non-cancelled events in a season the member has no time recorded for: candidates for backfill. */
export async function backfillableEvents(userId: string, seasonId: string, now: Date = new Date()) {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.seasonId, seasonId), lte(events.endsAt, now)))
    .orderBy(desc(events.startsAt));
  const mine = await db
    .select({ eventId: attendanceSessions.eventId })
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.userId, userId), eq(attendanceSessions.kind, "event"), ne(attendanceSessions.reviewState, "rejected")));
  const taken = new Set(mine.map((m) => m.eventId));
  return rows.filter((e) => !e.cancelledAt && !taken.has(e.id));
}
