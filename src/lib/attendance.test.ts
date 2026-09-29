import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

const T = (s: string) => new Date(s);
// Monday 2026-01-12, 3:00 PM New York (EST) = 20:00Z. Auto clock-out at 9 PM local = 02:00Z next day.
const MON_3PM = T("2026-01-12T20:00:00Z");

describe.skipIf(!hasTestDb)("attendance: clock in/out, sweeps, backfill, review", () => {
  let drop: () => Promise<void>;
  let userId: string;
  let otherId: string;
  let leadId: string;
  let seasonId: string;
  const eventIds: Record<string, string> = {};

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons, events } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "America/New_York", setupCompletedAt: new Date(), defaultCheckinVerification: "none" });
    const [s] = await db
      .insert(seasons)
      .values({ name: "2026", startDate: "2026-01-01", isCurrent: true, buildStart: "2026-01-03", buildEnd: "2026-02-18", workdays: [1, 2, 3, 4, 5] })
      .returning();
    seasonId = s!.id;
    const mk = async (key: string, role: "member" | "lead") =>
      (await db.insert(users).values({ email: `${key}@x.com`, name: key, role, status: "active", createdAt: T("2025-12-01T00:00:00Z") }).returning({ id: users.id }))[0]!.id;
    userId = await mk("kid", "member");
    otherId = await mk("other", "member");
    leadId = await mk("lead", "lead");
    const ev = async (key: string, start: string, end: string, extra: object = {}) => {
      const [e] = await db.insert(events).values({ seasonId, title: key, startsAt: T(start), endsAt: T(end), ...extra }).returning({ id: events.id });
      eventIds[key] = e!.id;
    };
    await ev("tapEvent", "2026-01-13T23:00:00Z", "2026-01-14T01:00:00Z"); // Tue 6-8 PM local
    await ev("codeEvent", "2026-01-14T23:00:00Z", "2026-01-15T01:00:00Z", { verification: "code" });
    await ev("cancelled", "2026-01-15T23:00:00Z", "2026-01-16T01:00:00Z", { cancelledAt: T("2026-01-10T00:00:00Z") });
    await ev("pastEvent", "2026-01-09T23:00:00Z", "2026-01-10T01:00:00Z"); // Fri Jan 9, 6-8 PM local
  });
  afterAll(async () => {
    await drop?.();
  });

  describe("open clock-in", () => {
    it("clocks in and out as often as you like, but never two running at once", async () => {
      const a = await import("./attendance");
      const inR = await a.clockInOpen(userId, { now: MON_3PM });
      expect(inR.ok).toBe(true);
      const again = await a.clockInOpen(userId, { now: T("2026-01-12T20:30:00Z") });
      expect(again).toMatchObject({ ok: false, conflict: true });
      const out = await a.clockOutOpen(userId, { now: T("2026-01-12T22:00:00Z") });
      expect(out).toMatchObject({ ok: true, autoClosed: false });
      if (out.ok) expect(out.session).toMatchObject({ status: "closed", reviewState: "none", origin: "live" });
      // Once out, a second session the same day is fine.
      const second = await a.clockInOpen(userId, { now: T("2026-01-12T23:00:00Z") });
      expect(second).toMatchObject({ ok: true, offHours: false });
      expect((await a.clockOutOpen(userId, { now: T("2026-01-13T00:00:00Z") })).ok).toBe(true);
    });

    it("lets you clock in outside build season or after the cutoff, pending a lead's approval", async () => {
      const a = await import("./attendance");
      const late = await a.clockInOpen(otherId, { now: T("2026-03-02T20:00:00Z") }); // after build season
      expect(late).toMatchObject({ ok: true, offHours: true });
      if (late.ok) expect(late.session.reviewState).toBe("pending_approval");
      // The daily cutoff doesn't cut off an off-hours session: it runs to the 16 hour cap.
      const out = await a.clockOutOpen(otherId, { now: T("2026-03-02T23:00:00Z") });
      expect(out).toMatchObject({ ok: true, autoClosed: false });
      const pastCutoff = await a.clockInOpen(otherId, { now: T("2026-01-13T02:30:00Z") }); // Jan 12, 9:30 PM local
      expect(pastCutoff).toMatchObject({ ok: true, offHours: true });
      await a.clockOutOpen(otherId, { now: T("2026-01-13T04:00:00Z") });
      expect((await a.clockOutOpen(otherId, { now: MON_3PM })).ok).toBe(false); // not clocked in
    });

    it("allows open clock-in on a non-workday inside the build range (Saturday)", async () => {
      const a = await import("./attendance");
      const r = await a.clockInOpen(otherId, { now: T("2026-01-10T20:00:00Z") });
      expect(r.ok).toBe(true);
      await a.clockOutOpen(otherId, { now: T("2026-01-10T22:00:00Z") });
    });

    it("clock-out after the cutoff closes at the cutoff and flags for review", async () => {
      const a = await import("./attendance");
      await a.clockInOpen(otherId, { now: T("2026-01-14T20:00:00Z") });
      const out = await a.clockOutOpen(otherId, { now: T("2026-01-15T04:00:00Z") }); // 11 PM local, sweep hasn't run
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.autoClosed).toBe(true);
        expect(out.session.clockOutAt!.toISOString()).toBe("2026-01-15T02:00:00.000Z");
        expect(out.session).toMatchObject({ status: "auto_closed", reviewState: "needs_review" });
      }
    });
  });

  describe("auto clock-out sweep", () => {
    it("closes forgotten sessions at 9 PM local, flags them, notifies once, and is idempotent", async () => {
      const a = await import("./attendance");
      const { db } = await import("@/db");
      const { attendanceSessions, inAppNotifications } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const forgot = await import("@/db").then(async ({ db: d }) => {
        const { users } = await import("@/db/schema");
        return (await d.insert(users).values({ email: "forgot@x.com", name: "forgot", status: "active", createdAt: T("2025-12-01T00:00:00Z") }).returning({ id: users.id }))[0]!.id;
      });
      await a.clockInOpen(forgot, { now: T("2026-01-16T20:00:00Z") }); // Fri 3 PM local
      const before = await a.sweepAutoClose(T("2026-01-17T01:59:00Z")); // 8:59 PM local: too early
      expect(before.open).toBe(0);
      const first = await a.sweepAutoClose(T("2026-01-17T02:00:30Z"));
      expect(first.open).toBe(1);
      const second = await a.sweepAutoClose(T("2026-01-17T02:01:30Z"));
      expect(second.open).toBe(0);
      const [row] = await db.select().from(attendanceSessions).where(eq(attendanceSessions.userId, forgot));
      expect(row).toMatchObject({ status: "auto_closed", reviewState: "needs_review" });
      expect(row!.clockOutAt!.toISOString()).toBe("2026-01-17T02:00:00.000Z");
      const notes = (await db.select().from(inAppNotifications).where(eq(inAppNotifications.userId, forgot))).filter((n) => n.type === "auto_clockout");
      expect(notes).toHaveLength(1);
      expect(notes[0]!.body).toContain("9:00 PM");
    });

    it("auto-closes event sessions at event end + grace (30 min)", async () => {
      const a = await import("./attendance");
      const { db } = await import("@/db");
      const { attendanceSessions } = await import("@/db/schema");
      const { and, eq } = await import("drizzle-orm");
      const id = eventIds.tapEvent!;
      await a.clockInEvent(userId, id, { now: T("2026-01-13T22:45:00Z") }); // 15 min before start
      expect((await a.sweepAutoClose(T("2026-01-14T01:29:00Z"))).event).toBe(0);
      expect((await a.sweepAutoClose(T("2026-01-14T01:30:30Z"))).event).toBe(1);
      const [row] = await db.select().from(attendanceSessions).where(and(eq(attendanceSessions.userId, userId), eq(attendanceSessions.eventId, id)));
      expect(row!.clockOutAt!.toISOString()).toBe("2026-01-14T01:30:00.000Z");
      expect(row).toMatchObject({ status: "auto_closed", reviewState: "needs_review" });
    });
  });

  describe("event clock-in", () => {
    it("opens 30 minutes before the start and closes at the end", async () => {
      const a = await import("./attendance");
      const id = eventIds.tapEvent!;
      expect((await a.clockInEvent(otherId, id, { now: T("2026-01-13T22:29:00Z") })).ok).toBe(false); // 31 min early
      expect((await a.clockInEvent(otherId, id, { now: T("2026-01-14T01:00:01Z") })).ok).toBe(false); // after end
      expect((await a.clockInEvent(otherId, id, { now: T("2026-01-13T22:31:00Z") })).ok).toBe(true);
      expect(await a.clockInEvent(otherId, id, { now: T("2026-01-13T23:10:00Z") })).toMatchObject({ ok: false, conflict: true });
      expect((await a.clockOutEvent(otherId, id, { now: T("2026-01-14T00:30:00Z") })).ok).toBe(true);
      expect((await a.clockOutEvent(otherId, id, { now: T("2026-01-14T00:40:00Z") })).ok).toBe(false);
    });

    it("refuses cancelled and unknown events", async () => {
      const a = await import("./attendance");
      expect((await a.clockInEvent(userId, eventIds.cancelled!, { now: T("2026-01-15T23:10:00Z") })).ok).toBe(false);
      expect((await a.clockInEvent(userId, "00000000-0000-4000-8000-000000000000", { now: MON_3PM })).ok).toBe(false);
    });

    it("code events require the right code; previous code works during the grace window; attempts are limited", async () => {
      const a = await import("./attendance");
      const { getCheckinSecret } = await import("./checkin");
      const { codeForWindow, windowIndex } = await import("./checkin-code");
      const id = eventIds.codeEvent!;
      const now = T("2026-01-14T23:10:10Z");
      const secret = (await getCheckinSecret(id, true))!;
      expect((await a.clockInEvent(userId, id, { now })).ok).toBe(false); // no code
      expect((await a.clockInEvent(userId, id, { now, code: "000000" })).ok).toBe(false);
      const w = windowIndex(now);
      // 10 s into the window: the previous window's code still works (grace = 30 s).
      const prev = await a.clockInEvent(otherId, id, { now, code: codeForWindow(secret, w - 1) });
      expect(prev.ok).toBe(true);
      // A code from two windows ago never works.
      expect((await a.clockInEvent(userId, id, { now, code: codeForWindow(secret, w - 2) })).ok).toBe(false);
      const good = await a.clockInEvent(userId, id, { now, code: codeForWindow(secret, w) });
      expect(good.ok).toBe(true);
    });

    it("rate limits repeated wrong codes", async () => {
      const a = await import("./attendance");
      const { db } = await import("@/db");
      const { users } = await import("@/db/schema");
      const [u] = await db.insert(users).values({ email: "guesser@x.com", name: "guesser", status: "active" }).returning({ id: users.id });
      const id = eventIds.codeEvent!;
      const now = T("2026-01-14T23:20:00Z");
      let lastError = "";
      for (let i = 0; i < 12; i++) {
        const r = await a.clockInEvent(u!.id, id, { now, code: String(100000 + i) });
        if (!r.ok) lastError = r.error;
      }
      expect(lastError).toContain("Too many");
    });
  });

  describe("offline taps", () => {
    it("uses the device timestamp, stores both times, and marks the origin", async () => {
      const a = await import("./attendance");
      const { db } = await import("@/db");
      const { users } = await import("@/db/schema");
      const [u] = await db.insert(users).values({ email: "offline@x.com", name: "offline", status: "active", createdAt: T("2025-12-01T00:00:00Z") }).returning({ id: users.id });
      const client = T("2026-01-19T20:00:00Z"); // Monday 3 PM local
      const now = T("2026-01-19T20:40:00Z");
      const r = await a.clockInOpen(u!.id, { now, clientTime: client }, "offline_synced");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.session.clockInAt.toISOString()).toBe(client.toISOString());
        expect(r.session.clientTimeIn!.toISOString()).toBe(client.toISOString());
        expect(r.session.serverTimeIn!.toISOString()).toBe(now.toISOString());
        expect(r.session.origin).toBe("offline_synced");
      }
      const out = await a.clockOutOpen(u!.id, { now: T("2026-01-19T22:40:00Z"), clientTime: T("2026-01-19T22:30:00Z") }, "offline_synced");
      expect(out.ok).toBe(true);
      if (out.ok) expect(out.session.clockOutAt!.toISOString()).toBe("2026-01-19T22:30:00.000Z");
    });

    it("rejects future and stale device times, and offline code check-ins", async () => {
      const a = await import("./attendance");
      const now = T("2026-01-20T20:00:00Z");
      expect((await a.clockInOpen(otherId, { now, clientTime: T("2026-01-20T20:05:00Z") }, "offline_synced")).ok).toBe(false);
      expect((await a.clockInOpen(otherId, { now, clientTime: T("2026-01-19T19:00:00Z") }, "offline_synced")).ok).toBe(false);
      const r = await a.clockInEvent(otherId, eventIds.codeEvent!, { now: T("2026-01-14T23:30:00Z"), clientTime: T("2026-01-14T23:25:00Z") }, "offline_synced");
      expect(r.ok).toBe(false);
    });

    it("conflicts with existing state are rejected with a clear message", async () => {
      const a = await import("./attendance");
      const now = T("2026-01-21T20:00:00Z");
      await a.clockInOpen(otherId, { now });
      const r = await a.clockInOpen(otherId, { now: T("2026-01-21T20:30:00Z"), clientTime: T("2026-01-21T20:20:00Z") }, "offline_synced");
      expect(r).toMatchObject({ ok: false, conflict: true });
      const early = await a.clockOutOpen(otherId, { now: T("2026-01-21T21:00:00Z"), clientTime: T("2026-01-21T19:00:00Z") }, "offline_synced");
      expect(early.ok).toBe(false);
    });

    it("runOnce answers a retried tap with the original result", async () => {
      const a = await import("./attendance");
      const { db } = await import("@/db");
      const { users } = await import("@/db/schema");
      const [u] = await db.insert(users).values({ email: "retry@x.com", name: "retry", status: "active", createdAt: T("2025-12-01T00:00:00Z") }).returning({ id: users.id });
      let calls = 0;
      const tap = async () => {
        calls++;
        const r = await a.clockInOpen(u!.id, { now: T("2026-01-22T20:00:00Z") });
        return r.ok ? { ok: true as const } : r;
      };
      const first = await a.runOnce(u!.id, "action-1", tap);
      const second = await a.runOnce(u!.id, "action-1", tap);
      expect(first).toEqual({ ok: true });
      expect(second).toEqual({ ok: true });
      expect(calls).toBe(1);
    });
  });

  describe("backfill", () => {
    it("pending approval by default; doesn't count until approved", async () => {
      const a = await import("./attendance");
      const { countsTowardHours, totalHours } = await import("./hours");
      const r = await a.addBackfill(userId, { kind: "event", eventId: eventIds.pastEvent!, inAt: "2026-01-09T18:00", outAt: "2026-01-09T20:00", note: "was there" }, T("2026-01-12T20:00:00Z"));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.pending).toBe(true);
      expect(r.session).toMatchObject({ reviewState: "pending_approval", origin: "backfill", selfReported: false });
      expect(countsTowardHours(r.session)).toBe(false);
      expect((await a.acceptSession(leadId, r.session.id)).ok).toBe(true);
      const after = await a.getSession(r.session.id);
      expect(countsTowardHours(after!)).toBe(true);
      expect(totalHours([after!])).toBe(2);
      expect((await a.acceptSession(leadId, r.session.id)).ok).toBe(false); // already reviewed
    });

    it("rejects overlaps, future times, non-build days, unfinished events, and non-members of a season", async () => {
      const a = await import("./attendance");
      const now = T("2026-01-12T20:00:00Z");
      // Overlaps the approved 6-8 PM entry on Jan 9.
      expect((await a.addBackfill(userId, { kind: "open", date: "2026-01-09", inAt: "2026-01-09T19:00", outAt: "2026-01-09T21:00" }, now)).ok).toBe(false);
      // Future
      expect((await a.addBackfill(userId, { kind: "open", date: "2026-01-08", inAt: "2026-01-08T10:00", outAt: "2026-01-13T10:00" }, now)).ok).toBe(false);
      // Not a build day (before build start)
      expect((await a.addBackfill(userId, { kind: "open", date: "2026-01-02", inAt: "2026-01-02T15:00", outAt: "2026-01-02T17:00" }, now)).ok).toBe(false);
      // Unfinished event
      expect((await a.addBackfill(userId, { kind: "event", eventId: eventIds.tapEvent!, inAt: "2026-01-13T18:00", outAt: "2026-01-13T20:00" }, now)).ok).toBe(false);
      // Today is not "past"
      expect((await a.addBackfill(userId, { kind: "open", date: "2026-01-12", inAt: "2026-01-12T10:00", outAt: "2026-01-12T11:00" }, now)).ok).toBe(false);
      // Too long, and out before in
      expect((await a.addBackfill(userId, { kind: "open", date: "2026-01-05", inAt: "2026-01-05T01:00", outAt: "2026-01-05T20:00" }, now)).ok).toBe(false);
      expect((await a.addBackfill(userId, { kind: "open", date: "2026-01-05", inAt: "2026-01-05T15:00", outAt: "2026-01-05T14:00" }, now)).ok).toBe(false);
    });

    it("counts immediately and is flagged self-reported when approval is switched off", async () => {
      const a = await import("./attendance");
      const { db } = await import("@/db");
      const { teamSettings } = await import("@/db/schema");
      const { countsTowardHours } = await import("./hours");
      await db.update(teamSettings).set({ backfillRequiresApproval: false });
      const r = await a.addBackfill(userId, { kind: "open", date: "2026-01-06", inAt: "2026-01-06T15:00", outAt: "2026-01-06T17:00" }, T("2026-01-12T20:00:00Z"));
      await db.update(teamSettings).set({ backfillRequiresApproval: true });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.pending).toBe(false);
        expect(r.session).toMatchObject({ reviewState: "none", selfReported: true });
        expect(countsTowardHours(r.session)).toBe(true);
      }
    });

    it("denied backfill never counts", async () => {
      const a = await import("./attendance");
      const { countsTowardHours } = await import("./hours");
      const r = await a.addBackfill(userId, { kind: "open", date: "2026-01-07", inAt: "2026-01-07T15:00", outAt: "2026-01-07T17:00" }, T("2026-01-12T20:00:00Z"));
      if (!r.ok) throw new Error(r.error);
      expect((await a.rejectSession(leadId, r.session.id, "not on roster")).ok).toBe(true);
      expect(countsTowardHours((await a.getSession(r.session.id))!)).toBe(false);
    });
  });

  describe("review, edits and audit", () => {
    it("editing an auto-closed session sets the real end, marks it edited, and is audited", async () => {
      const a = await import("./attendance");
      const { db } = await import("@/db");
      const { attendanceSessions, auditLog } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [flagged] = await db.select().from(attendanceSessions).where(eq(attendanceSessions.reviewState, "needs_review")).limit(1);
      const newOut = new Date(flagged!.clockInAt.getTime() + 2 * 3_600_000);
      expect((await a.editSessionTimes(leadId, flagged!.id, { outAt: newOut }, T("2026-02-01T00:00:00Z"))).ok).toBe(true);
      const after = await a.getSession(flagged!.id);
      expect(after).toMatchObject({ status: "edited", reviewState: "approved" });
      expect(after!.clockOutAt!.toISOString()).toBe(newOut.toISOString());
      const log = await db.select().from(auditLog).where(eq(auditLog.targetId, flagged!.id));
      expect(log.some((l) => l.action === "attendance.edit")).toBe(true);
    });

    it("force clock-out and admin-added time work and are audited", async () => {
      const a = await import("./attendance");
      const { db } = await import("@/db");
      const { auditLog, users } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [u] = await db.insert(users).values({ email: "stuck@x.com", name: "stuck", status: "active", createdAt: T("2025-12-01T00:00:00Z") }).returning({ id: users.id });
      const inR = await a.clockInOpen(u!.id, { now: T("2026-01-23T20:00:00Z") });
      if (!inR.ok) throw new Error(inR.error);
      expect((await a.forceClockOut(leadId, inR.session.id, T("2026-01-23T21:00:00Z"))).ok).toBe(true);
      expect((await a.getSession(inR.session.id))).toMatchObject({ status: "edited", reviewState: "approved" });
      expect((await a.forceClockOut(leadId, inR.session.id)).ok).toBe(false);
      const added = await a.addSessionForUser(leadId, { userId: u!.id, kind: "open", inAt: T("2026-01-26T20:00:00Z"), outAt: T("2026-01-26T22:00:00Z") }, T("2026-02-01T00:00:00Z"));
      expect(added.ok).toBe(true);
      const acts = (await db.select().from(auditLog).where(eq(auditLog.actorId, leadId))).map((l) => l.action);
      expect(acts).toEqual(expect.arrayContaining(["attendance.force_clock_out", "attendance.add"]));
    });
  });
});
