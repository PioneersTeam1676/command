import { and, asc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendanceEditRequests, attendanceSessions, events, seasons, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { MAX_SESSION_MS, type Res, type Session } from "@/lib/attendance";
import { attendanceFlags, needsAttention, QUIET_FROM_HOUR, QUIET_UNTIL_HOUR, VERY_LONG_MS } from "@/lib/attendance-flags";
import { isUniqueViolation } from "@/lib/db-errors";
import { overlaps } from "@/lib/hours";
import { getSettings } from "@/lib/settings";
import { fromDatetimeLocal, localDateOf } from "@/lib/time";

export type EditRequest = typeof attendanceEditRequests.$inferSelect;

const fail = (error: string) => ({ ok: false as const, error });

const FINISHED = new Set(["closed", "edited", "auto_closed"]);
/** A correction stays near what happened: not another shift, and not far from its event. */
const MAX_SHIFT_MS = 12 * 3_600_000;
const EVENT_LEAD_MS = 60 * 60_000;
const EVENT_TAIL_MS = 2 * 3_600_000;
const REASON_MIN = 3;
const REASON_MAX = 300;

/**
 * Members change or remove their own entries by asking. The change applies at once, so their hours stay right, and the
 * entry carries a pending request until a lead approves it or reverts it to what it was.
 */

async function eligibleSession(userId: string, sessionId: string): Promise<{ ok: true; session: Session; season: typeof seasons.$inferSelect } | { ok: false; error: string }> {
  const [s] = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, sessionId));
  if (!s || s.userId !== userId) return fail("That entry isn't yours.");
  if (!s.clockOutAt || !FINISHED.has(s.status)) return fail("Only finished entries can be changed. Clock out first.");
  if (s.reviewState === "rejected") return fail("That entry doesn't count toward your hours, so there's nothing to change.");
  if (s.reviewState === "pending_approval") return fail("That entry is still waiting for approval. A lead can change it.");
  const [season] = await db.select().from(seasons).where(eq(seasons.id, s.seasonId));
  if (!season?.isCurrent) return fail("That season is closed. Ask a lead to change it.");
  const [open] = await db
    .select({ id: attendanceEditRequests.id })
    .from(attendanceEditRequests)
    .where(and(eq(attendanceEditRequests.sessionId, sessionId), eq(attendanceEditRequests.state, "pending")));
  if (open) return fail("You already asked for a change to this entry. A lead will look at it.");
  return { ok: true, session: s, season };
}

function cleanReason(reason: string): { ok: true; reason: string } | { ok: false; error: string } {
  const r = reason.trim();
  if (r.length < REASON_MIN) return fail("Say briefly why, so a lead knows what happened.");
  return { ok: true, reason: r.slice(0, REASON_MAX) };
}

const prevOf = (s: Session) => ({ prevClockInAt: s.clockInAt, prevClockOutAt: s.clockOutAt, prevStatus: s.status, prevReviewState: s.reviewState });

export async function requestEdit(userId: string, sessionId: string, input: { inAt: string; outAt: string; reason: string }, now: Date = new Date()): Promise<Res> {
  const why = cleanReason(input.reason);
  if (!why.ok) return why;
  const el = await eligibleSession(userId, sessionId);
  if (!el.ok) return el;
  const s = el.session;
  const tz = (await getSettings()).timezone;

  let inAt: Date;
  let outAt: Date;
  try {
    inAt = fromDatetimeLocal(input.inAt, tz);
    outAt = fromDatetimeLocal(input.outAt, tz);
  } catch {
    return fail("Enter valid in and out times.");
  }
  if (outAt <= inAt) return fail("Your out time has to be after your in time.");
  if (outAt.getTime() - inAt.getTime() > MAX_SESSION_MS) return fail("That's over 16 hours. Split it across days or ask a lead.");
  if (outAt > now) return fail("You can only use times that have already happened.");
  if (inAt.getTime() === s.clockInAt.getTime() && outAt.getTime() === s.clockOutAt!.getTime()) return fail("Those are the times it already has.");

  if (Math.abs(inAt.getTime() - s.clockInAt.getTime()) > MAX_SHIFT_MS) return fail("That's too far from the original time. If you missed a whole shift, add it as a new entry instead.");
  if (s.kind === "event" && s.eventId) {
    const [ev] = await db.select({ startsAt: events.startsAt, endsAt: events.endsAt }).from(events).where(eq(events.id, s.eventId));
    if (ev && (inAt.getTime() < ev.startsAt.getTime() - EVENT_LEAD_MS || outAt.getTime() > ev.endsAt.getTime() + EVENT_TAIL_MS)) return fail("Those times are too far from the event. Ask a lead to change it.");
  }


  const others = await db
    .select({ clockInAt: attendanceSessions.clockInAt, clockOutAt: attendanceSessions.clockOutAt })
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.userId, userId), ne(attendanceSessions.reviewState, "rejected"), ne(attendanceSessions.id, sessionId)));
  for (const e of others) {
    if (overlaps([inAt, outAt], [e.clockInAt, e.clockOutAt ?? now])) return fail("That overlaps time you've already recorded.");
  }

  try {
    const done = await db.transaction(async (tx): Promise<Res> => {
      // Only if nobody changed the entry since we read it (a lead may be editing it right now).
      const [updated] = await tx
        .update(attendanceSessions)
        .set({ clockInAt: inAt, clockOutAt: outAt, status: "edited", reviewState: "none", localDate: localDateOf(inAt, tz) })
        .where(and(eq(attendanceSessions.id, sessionId), eq(attendanceSessions.clockInAt, s.clockInAt), eq(attendanceSessions.reviewState, s.reviewState), eq(attendanceSessions.status, s.status)))
        .returning({ id: attendanceSessions.id });
      if (!updated) return fail("That entry just changed. Reload and try again.");
      const [req] = await tx.insert(attendanceEditRequests).values({ sessionId, userId, kind: "edit", reason: why.reason, ...prevOf(s), newClockInAt: inAt, newClockOutAt: outAt }).returning({ id: attendanceEditRequests.id });
      // The reason stays on the request row only, so erasing a person removes it everywhere.
      await audit({ actorId: userId, action: "attendance.edit_requested", targetType: "attendance", targetId: sessionId, before: { clockInAt: s.clockInAt, clockOutAt: s.clockOutAt }, after: { clockInAt: inAt, clockOutAt: outAt, requestId: req!.id } }, tx);
      return { ok: true };
    });
    return done;
  } catch (e) {
    if (isUniqueViolation(e)) return fail("You already asked for a change to this entry. A lead will look at it.");
    throw e;
  }
}

export async function requestDelete(userId: string, sessionId: string, reason: string, _now: Date = new Date()): Promise<Res> {
  const why = cleanReason(reason);
  if (!why.ok) return why;
  const el = await eligibleSession(userId, sessionId);
  if (!el.ok) return el;
  const s = el.session;
  try {
    return await db.transaction(async (tx): Promise<Res> => {
      const [updated] = await tx
        .update(attendanceSessions)
        .set({ reviewState: "rejected" })
        .where(and(eq(attendanceSessions.id, sessionId), eq(attendanceSessions.clockInAt, s.clockInAt), eq(attendanceSessions.reviewState, s.reviewState), eq(attendanceSessions.status, s.status)))
        .returning({ id: attendanceSessions.id });
      if (!updated) return fail("That entry just changed. Reload and try again.");
      const [req] = await tx.insert(attendanceEditRequests).values({ sessionId, userId, kind: "delete", reason: why.reason, ...prevOf(s) }).returning({ id: attendanceEditRequests.id });
      await audit({ actorId: userId, action: "attendance.removal_requested", targetType: "attendance", targetId: sessionId, before: { reviewState: s.reviewState }, after: { reviewState: "rejected", requestId: req!.id } }, tx);
      return { ok: true };
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("You already asked for a change to this entry. A lead will look at it.");
    throw e;
  }
}

/** Decide a request exactly once: the first caller to flip it from pending wins, the rest are told it was already decided. */
async function claim(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], requestId: string, state: "approved" | "reverted" | "superseded", actorId: string, now: Date) {
  const [r] = await tx
    .update(attendanceEditRequests)
    .set({ state, decidedBy: actorId, decidedAt: now })
    .where(and(eq(attendanceEditRequests.id, requestId), eq(attendanceEditRequests.state, "pending")))
    .returning();
  return r;
}

const GONE = "That request was already decided, or doesn't exist.";

/** Keep the change. An approved edit counts as reviewed; an approved removal stays out of the hours. */
export async function approveRequest(actorId: string, requestId: string, now: Date = new Date()): Promise<Res> {
  return db.transaction(async (tx): Promise<Res> => {
    const r = await claim(tx, requestId, "approved", actorId, now);
    if (!r) return fail(GONE);
    if (r.kind === "edit") await tx.update(attendanceSessions).set({ reviewState: "approved" }).where(eq(attendanceSessions.id, r.sessionId));
    await audit({ actorId, action: "attendance.request_approved", targetType: "attendance", targetId: r.sessionId, after: { kind: r.kind, requestId } }, tx);
    return { ok: true };
  });
}

/**
 * Put the entry back exactly as it was before the request. If someone has changed it since (a lead edited or rejected it),
 * there is nothing sensible to restore: the request is closed as superseded so it doesn't sit in the queue forever.
 */
export async function revertRequest(actorId: string, requestId: string, now: Date = new Date()): Promise<Res> {
  const tz = (await getSettings()).timezone;
  return db.transaction(async (tx): Promise<Res> => {
    const r = await claim(tx, requestId, "reverted", actorId, now);
    if (!r) return fail(GONE);
    const [s] = await tx.select().from(attendanceSessions).where(eq(attendanceSessions.id, r.sessionId)).for("update");
    const unchanged =
      !!s &&
      (r.kind === "edit"
        ? s.clockInAt.getTime() === r.newClockInAt?.getTime() && s.clockOutAt?.getTime() === r.newClockOutAt?.getTime() && s.reviewState === "none"
        : s.reviewState === "rejected");
    if (!s || !unchanged) {
      await tx.update(attendanceEditRequests).set({ state: "superseded" }).where(eq(attendanceEditRequests.id, requestId));
      await audit({ actorId, action: "attendance.request_superseded", targetType: "attendance", targetId: r.sessionId, after: { requestId } }, tx);
      return fail("This entry was changed after the request, so there was nothing to put back. The request is closed.");
    }
    await tx
      .update(attendanceSessions)
      .set({ clockInAt: r.prevClockInAt, clockOutAt: r.prevClockOutAt, status: r.prevStatus, reviewState: r.prevReviewState, localDate: localDateOf(r.prevClockInAt, tz) })
      .where(eq(attendanceSessions.id, r.sessionId));
    await audit({ actorId, action: "attendance.request_reverted", targetType: "attendance", targetId: r.sessionId, before: { clockInAt: s.clockInAt, clockOutAt: s.clockOutAt, reviewState: s.reviewState }, after: { clockInAt: r.prevClockInAt, clockOutAt: r.prevClockOutAt, reviewState: r.prevReviewState } }, tx);
    return { ok: true };
  });
}

/** The review queue: who asked, what the entry was and is now. */
export async function pendingRequests() {
  return db
    .select({ request: attendanceEditRequests, session: attendanceSessions, userName: users.name, eventTitle: events.title })
    .from(attendanceEditRequests)
    .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceEditRequests.sessionId))
    .innerJoin(users, eq(users.id, attendanceEditRequests.userId))
    .leftJoin(events, eq(events.id, attendanceSessions.eventId))
    .where(eq(attendanceEditRequests.state, "pending"))
    .orderBy(asc(attendanceEditRequests.createdAt));
}

export async function pendingRequestCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(attendanceEditRequests).where(eq(attendanceEditRequests.state, "pending"));
  return row?.n ?? 0;
}

/** Pending request per entry, to mark rows in a list. */
export async function pendingRequestsFor(sessionIds: string[]): Promise<Map<string, EditRequest>> {
  if (sessionIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(attendanceEditRequests)
    .where(and(inArray(attendanceEditRequests.sessionId, sessionIds), eq(attendanceEditRequests.state, "pending")));
  return new Map(rows.map((r) => [r.sessionId, r]));
}

/** Older entries are no longer worth a lead's attention, and the badge runs on every staff page. */
const UNUSUAL_WINDOW_MS = 45 * 24 * 3_600_000;

/**
 * Unreviewed entries in the last 45 days of the current season that look wrong (a clock-out at 3am, a day that ran far too long) for the
 * review page. Entries with a pending request are handled there instead.
 */
export async function unusualEntries(now: Date = new Date()) {
  const tz = (await getSettings()).timezone;
  const rows = await db
    .select({ session: attendanceSessions, userName: users.name, eventTitle: events.title })
    .from(attendanceSessions)
    .innerJoin(users, eq(users.id, attendanceSessions.userId))
    .innerJoin(seasons, eq(seasons.id, attendanceSessions.seasonId))
    .leftJoin(events, eq(events.id, attendanceSessions.eventId))
    .where(
      and(
        eq(seasons.isCurrent, true),
        eq(attendanceSessions.reviewState, "none"),
        inArray(attendanceSessions.status, ["closed", "edited"]),
        gte(attendanceSessions.clockInAt, new Date(now.getTime() - UNUSUAL_WINDOW_MS)),
        // Let the database discard ordinary afternoons; the exact rules below stay the single source of truth.
        sql`(${attendanceSessions.clockOutAt} - ${attendanceSessions.clockInAt} > ${VERY_LONG_MS / 1000} * interval '1 second'
          or extract(hour from ${attendanceSessions.clockInAt} at time zone ${tz}) >= ${QUIET_FROM_HOUR}
          or extract(hour from ${attendanceSessions.clockInAt} at time zone ${tz}) < ${QUIET_UNTIL_HOUR}
          or extract(hour from ${attendanceSessions.clockOutAt} at time zone ${tz}) >= ${QUIET_FROM_HOUR}
          or extract(hour from ${attendanceSessions.clockOutAt} at time zone ${tz}) < ${QUIET_UNTIL_HOUR})`,
      ),
    )
    .orderBy(asc(attendanceSessions.clockInAt));
  const flagged = rows.filter((r) => needsAttention(r.session, tz, now));
  const pending = await pendingRequestsFor(flagged.map((r) => r.session.id));
  return flagged
    .filter((r) => !pending.has(r.session.id))
    .map((r) => ({ ...r, flags: attendanceFlags(r.session, tz, now).filter((f) => f === "unusual_hours" || f === "very_long") }));
}

/** A lead looked at an unusual entry and it is fine as it is. */
export async function markReviewed(actorId: string, sessionId: string): Promise<Res> {
  const [s] = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, sessionId));
  if (!s) return fail("That entry doesn't exist.");
  if (s.reviewState !== "none") return fail("That entry was already reviewed.");
  await db.update(attendanceSessions).set({ reviewState: "approved" }).where(eq(attendanceSessions.id, sessionId));
  await audit({ actorId, action: "attendance.accept", targetType: "attendance", targetId: sessionId, before: { reviewState: "none" }, after: { reviewState: "approved" } });
  return { ok: true };
}
