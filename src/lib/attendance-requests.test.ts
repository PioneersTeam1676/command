import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

const T = (s: string) => new Date(s);
const NOW = T("2026-02-01T00:00:00Z");

describe.skipIf(!hasTestDb)("attendance: edit and removal requests", () => {
  let drop: () => Promise<void>;
  let kid: string;
  let other: string;
  let lead: string;
  let n = 0;

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "America/New_York", setupCompletedAt: new Date() });
    await db.insert(seasons).values({ name: "2026", startDate: "2026-01-01", isCurrent: true, buildStart: "2026-01-03", buildEnd: "2026-02-18" });
    const mk = async (key: string, role: "member" | "lead") => (await db.insert(users).values({ email: `${key}@x.com`, name: key, role, status: "active", createdAt: T("2025-12-01T00:00:00Z") }).returning({ id: users.id }))[0]!.id;
    kid = await mk("kid", "member");
    other = await mk("other", "member");
    lead = await mk("lead", "lead");
  });
  afterAll(async () => {
    await drop?.();
  });

  /** A fresh closed entry on its own day so tests never overlap each other: 17:00 to 20:00 New York time. */
  async function entry(userId = kid) {
    const a = await import("./attendance");
    n += 1;
    const day = `2026-01-${String(n + 5).padStart(2, "0")}`;
    const inAt = T(`${day}T22:00:00Z`);
    const r = await a.addSessionForUser(lead, { userId, kind: "open", inAt, outAt: new Date(inAt.getTime() + 3 * 3_600_000) }, NOW);
    if (!r.ok) throw new Error(r.error);
    return { a, session: r.session, day };
  }
  const reqs = () => import("./attendance-requests");

  it("applies an edit at once, keeps the original, and flags it as pending", async () => {
    const { a, session, day } = await entry();
    const q = await reqs();
    const r = await q.requestEdit(kid, session.id, { inAt: `${day}T17:00`, outAt: `${day}T19:00`, reason: "Left early for a dentist visit" }, NOW);
    expect(r.ok).toBe(true);
    const after = await a.getSession(session.id);
    expect(after).toMatchObject({ status: "edited" });
    expect(after!.clockOutAt!.getTime() - after!.clockInAt.getTime()).toBe(2 * 3_600_000);
    const pending = await q.pendingRequestsFor([session.id]);
    const p = pending.get(session.id)!;
    expect(p).toMatchObject({ kind: "edit", state: "pending", reason: "Left early for a dentist visit" });
    expect(p.prevClockInAt).toEqual(session.clockInAt);
    expect(p.prevClockOutAt).toEqual(session.clockOutAt);
  });

  it("refuses someone else's entry, a second pending request, a short reason and bad times", async () => {
    const { session, day } = await entry();
    const q = await reqs();
    const good = { inAt: `${day}T17:00`, outAt: `${day}T19:00`, reason: "Wrong time entered" };
    expect((await q.requestEdit(other, session.id, good, NOW)).ok).toBe(false);
    expect((await q.requestEdit(kid, session.id, { ...good, reason: "no" }, NOW)).ok).toBe(false);
    expect((await q.requestEdit(kid, session.id, { ...good, outAt: `${day}T16:00` }, NOW)).ok).toBe(false);
    expect((await q.requestEdit(kid, session.id, { ...good, outAt: "2026-03-01T10:00" }, NOW)).ok).toBe(false);
    expect((await q.requestEdit(kid, session.id, { ...good, outAt: `${day}T23:30`, inAt: `${day}T05:00` }, NOW)).ok).toBe(false); // over 16 hours
    expect((await q.requestEdit(kid, session.id, good, NOW)).ok).toBe(true);
    expect((await q.requestEdit(kid, session.id, good, NOW)).ok).toBe(false);
  });

  it("refuses a running session and an entry that is still waiting for approval", async () => {
    const q = await reqs();
    const a = await import("./attendance");
    const { db } = await import("@/db");
    const { attendanceSessions } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { session, day } = await entry();
    await db.update(attendanceSessions).set({ status: "open", clockOutAt: null }).where(eq(attendanceSessions.id, session.id));
    expect((await q.requestEdit(kid, session.id, { inAt: `${day}T17:00`, outAt: `${day}T19:00`, reason: "Fix the time" }, NOW)).ok).toBe(false);
    const second = await entry();
    await db.update(attendanceSessions).set({ reviewState: "pending_approval" }).where(eq(attendanceSessions.id, second.session.id));
    expect((await q.requestEdit(kid, second.session.id, { inAt: `${second.day}T17:00`, outAt: `${second.day}T19:00`, reason: "Fix the time" }, NOW)).ok).toBe(false);
    expect(await a.getSession(second.session.id)).toMatchObject({ reviewState: "pending_approval" });
    // A running entry occupies time up to now, so don't leave one behind for the other tests.
    await a.deleteSessionForever(session.id);
  });

  it("refuses an edit that would overlap another of the member's entries", async () => {
    const q = await reqs();
    const a = await import("./attendance");
    const first = await entry();
    // A second entry the same evening, 21:00 to 22:00 local.
    const later = await a.addSessionForUser(lead, { userId: kid, kind: "open", inAt: T(`${first.day.slice(0, 8)}${String(Number(first.day.slice(8)) + 1).padStart(2, "0")}T02:00:00Z`), outAt: T(`${first.day.slice(0, 8)}${String(Number(first.day.slice(8)) + 1).padStart(2, "0")}T03:00:00Z`) }, NOW);
    expect(later.ok).toBe(true);
    const r = await q.requestEdit(kid, first.session.id, { inAt: `${first.day}T17:00`, outAt: `${first.day}T21:30`, reason: "Stayed late" }, NOW);
    expect(r.ok).toBe(false);
  });

  it("refuses an edit that is really a different shift, and allows a normal correction", async () => {
    const q = await reqs();
    const { session, day } = await entry();
    const base = { reason: "Wrong day entered" };
    // More than 12 hours from the original start is a different shift, not a correction.
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const nextDay = next.toISOString().slice(0, 10);
    expect((await q.requestEdit(kid, session.id, { ...base, inAt: `${nextDay}T06:00`, outAt: `${nextDay}T08:00` }, NOW)).ok).toBe(false);
    expect((await q.requestEdit(kid, session.id, { ...base, inAt: `${day}T17:00`, outAt: `${day}T19:00` }, NOW)).ok).toBe(true);
  });

  it("keeps an event entry near its event", async () => {
    const q = await reqs();
    const a = await import("./attendance");
    const { db } = await import("@/db");
    const { events, seasons } = await import("@/db/schema");
    const [season] = await db.select().from(seasons);
    const [ev] = await db.insert(events).values({ seasonId: season!.id, title: "Meeting", startsAt: T("2026-01-27T23:00:00Z"), endsAt: T("2026-01-28T01:00:00Z") }).returning();
    const made = await a.addSessionForUser(lead, { userId: kid, kind: "event", eventId: ev!.id, inAt: T("2026-01-27T23:00:00Z"), outAt: T("2026-01-28T01:00:00Z") }, NOW);
    if (!made.ok) throw new Error(made.error);
    const id = made.session.id;
    expect((await q.requestEdit(kid, id, { inAt: "2026-01-27T18:00", outAt: "2026-01-27T23:30", reason: "Stayed to clean up" }, NOW)).ok).toBe(false); // out at 23:30 local, 4.5h after the event ended
    expect((await q.requestEdit(kid, id, { inAt: "2026-01-27T18:00", outAt: "2026-01-27T20:30", reason: "Stayed to clean up" }, NOW)).ok).toBe(true);
  });

  it("resets an earlier approval, so an edited entry is not treated as already reviewed", async () => {
    const { a, session, day } = await entry(); // admin-added, so it starts approved
    expect(session.reviewState).toBe("approved");
    const q = await reqs();
    await q.requestEdit(kid, session.id, { inAt: `${day}T17:00`, outAt: `${day}T19:00`, reason: "Left early" }, NOW);
    expect((await a.getSession(session.id))!.reviewState).toBe("none");
    const p = (await q.pendingRequestsFor([session.id])).get(session.id)!;
    await q.revertRequest(lead, p.id);
    expect((await a.getSession(session.id))!.reviewState).toBe("approved");
  });

  it("keeps the member's written reason out of the audit log", async () => {
    const { session, day } = await entry();
    const q = await reqs();
    await q.requestEdit(kid, session.id, { inAt: `${day}T17:00`, outAt: `${day}T19:00`, reason: "Dentist appointment at four" }, NOW);
    const { db } = await import("@/db");
    const { auditLog } = await import("@/db/schema");
    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain("Dentist appointment");
  });

  it("lets only one of two simultaneous decisions win", async () => {
    const { a, session, day } = await entry();
    const q = await reqs();
    await q.requestEdit(kid, session.id, { inAt: `${day}T17:00`, outAt: `${day}T19:00`, reason: "Left early" }, NOW);
    const p = (await q.pendingRequestsFor([session.id])).get(session.id)!;
    const results = await Promise.all([q.approveRequest(lead, p.id), q.revertRequest(lead, p.id), q.approveRequest(lead, p.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const s = (await a.getSession(session.id))!;
    const { db } = await import("@/db");
    const { attendanceEditRequests } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(attendanceEditRequests).where(eq(attendanceEditRequests.id, p.id));
    // Whichever decision won, the entry matches it: kept (new times, reviewed) or put back (original times and state).
    if (row!.state === "approved") {
      expect(s.clockOutAt).toEqual(row!.newClockOutAt);
      expect(s.reviewState).toBe("approved");
    } else {
      expect(row!.state).toBe("reverted");
      expect(s.clockOutAt).toEqual(session.clockOutAt);
      expect(s.reviewState).toBe(session.reviewState);
    }
    expect((await q.pendingRequestsFor([session.id])).size).toBe(0);
  });

  it("closes a request that can no longer be reverted instead of leaving it stuck", async () => {
    const { a, session, day } = await entry();
    const q = await reqs();
    await q.requestEdit(kid, session.id, { inAt: `${day}T17:00`, outAt: `${day}T19:00`, reason: "Left early" }, NOW);
    const p = (await q.pendingRequestsFor([session.id])).get(session.id)!;
    await a.rejectSession(lead, session.id, "Not true");
    expect((await q.revertRequest(lead, p.id)).ok).toBe(false);
    expect((await q.pendingRequestsFor([session.id])).size).toBe(0);
    expect((await a.getSession(session.id))!.reviewState).toBe("rejected");
  });

  it("approve keeps the change and marks the entry reviewed", async () => {
    const { a, session, day } = await entry();
    const q = await reqs();
    expect(await q.requestEdit(kid, session.id, { inAt: `${day}T17:00`, outAt: `${day}T19:00`, reason: "Left early" }, NOW)).toEqual({ ok: true });
    const p = (await q.pendingRequestsFor([session.id])).get(session.id)!;
    expect((await q.approveRequest(lead, p.id)).ok).toBe(true);
    expect(await a.getSession(session.id)).toMatchObject({ status: "edited", reviewState: "approved" });
    expect((await q.pendingRequestsFor([session.id])).size).toBe(0);
    expect((await q.approveRequest(lead, p.id)).ok).toBe(false); // already decided
  });

  it("revert restores the original times", async () => {
    const { a, session, day } = await entry();
    const q = await reqs();
    expect(await q.requestEdit(kid, session.id, { inAt: `${day}T17:00`, outAt: `${day}T19:00`, reason: "Left early" }, NOW)).toEqual({ ok: true });
    const p = (await q.pendingRequestsFor([session.id])).get(session.id)!;
    expect((await q.revertRequest(lead, p.id)).ok).toBe(true);
    const back = await a.getSession(session.id);
    expect(back!.clockInAt).toEqual(session.clockInAt);
    expect(back!.clockOutAt).toEqual(session.clockOutAt);
    expect(back).toMatchObject({ status: session.status, reviewState: session.reviewState });
    // A new request is possible again afterwards.
    expect((await q.requestEdit(kid, session.id, { inAt: `${day}T17:00`, outAt: `${day}T18:00`, reason: "Second try" }, NOW)).ok).toBe(true);
  });

  it("revert refuses when the entry was changed by someone else since", async () => {
    const { a, session, day } = await entry();
    const q = await reqs();
    expect(await q.requestEdit(kid, session.id, { inAt: `${day}T17:00`, outAt: `${day}T19:00`, reason: "Left early" }, NOW)).toEqual({ ok: true });
    const p = (await q.pendingRequestsFor([session.id])).get(session.id)!;
    await a.editSessionTimes(lead, session.id, { outAt: T(`${day}T23:30:00Z`) }, NOW);
    const r = await q.revertRequest(lead, p.id);
    expect(r.ok).toBe(false);
    expect((await a.getSession(session.id))!.clockOutAt).toEqual(T(`${day}T23:30:00Z`));
  });

  it("a removal request stops the entry counting at once, and revert brings it back", async () => {
    const { a, session } = await entry();
    const { countsTowardHours } = await import("./hours");
    const q = await reqs();
    expect((await q.requestDelete(kid, session.id, "Clocked in by mistake", NOW)).ok).toBe(true);
    const gone = await a.getSession(session.id);
    expect(gone).toMatchObject({ reviewState: "rejected" });
    expect(countsTowardHours(gone!)).toBe(false);
    const p = (await q.pendingRequestsFor([session.id])).get(session.id)!;
    expect(p.kind).toBe("delete");
    expect((await q.revertRequest(lead, p.id)).ok).toBe(true);
    const back = await a.getSession(session.id);
    expect(back).toMatchObject({ reviewState: session.reviewState });
    expect(countsTowardHours(back!)).toBe(true);
  });

  it("approving a removal keeps the entry out of the hours", async () => {
    const { a, session } = await entry();
    const q = await reqs();
    await q.requestDelete(kid, session.id, "Duplicate entry", NOW);
    const p = (await q.pendingRequestsFor([session.id])).get(session.id)!;
    expect((await q.approveRequest(lead, p.id)).ok).toBe(true);
    expect(await a.getSession(session.id)).toMatchObject({ reviewState: "rejected" });
  });

  it("lists pending requests for leads with the member's name and counts them", async () => {
    const { session, day } = await entry(other);
    const q = await reqs();
    const before = await q.pendingRequestCount();
    await q.requestEdit(other, session.id, { inAt: `${day}T17:00`, outAt: `${day}T19:00`, reason: "Left early" }, NOW);
    expect(await q.pendingRequestCount()).toBe(before + 1);
    const list = await q.pendingRequests();
    expect(list.find((r) => r.request.sessionId === session.id)).toMatchObject({ userName: "other" });
  });

  it("erasing a person's data also removes the reasons they wrote", async () => {
    const { db } = await import("@/db");
    const { users, attendanceEditRequests } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { erasePersonalData } = await import("./users");
    const [gone] = await db.insert(users).values({ email: "gone@x.com", name: "Gone", role: "member", status: "active", createdAt: T("2025-12-01T00:00:00Z") }).returning({ id: users.id });
    const { session, day } = await entry(gone!.id);
    const q = await reqs();
    expect(await q.requestEdit(gone!.id, session.id, { inAt: `${day}T17:00`, outAt: `${day}T19:00`, reason: "Private medical appointment" }, NOW)).toEqual({ ok: true });
    expect((await erasePersonalData(lead, gone!.id)).ok).toBe(true);
    expect((await db.select().from(attendanceEditRequests).where(eq(attendanceEditRequests.userId, gone!.id))).length).toBe(0);
  });

  describe("unusual entries", () => {
    async function live(userId: string, inAt: string, outAt: string, reviewState = "none") {
      const { db } = await import("@/db");
      const { attendanceSessions, seasons } = await import("@/db/schema");
      const [season] = await db.select().from(seasons);
      const [row] = await db
        .insert(attendanceSessions)
        .values({ userId, seasonId: season!.id, kind: "open", localDate: inAt.slice(0, 10), clockInAt: T(inAt), clockOutAt: T(outAt), status: "closed", origin: "live", reviewState })
        .returning();
      return row!;
    }

    it("lists unreviewed entries that look unusual, with the member's name, and leaves ordinary ones out", async () => {
      const q = await reqs();
      const odd = await live(other, "2025-12-20T20:00:00Z", "2025-12-21T08:00:00Z"); // out at 3am New York
      const ordinary = await live(other, "2025-12-22T20:00:00Z", "2025-12-22T23:00:00Z");
      const approved = await live(other, "2025-12-23T20:00:00Z", "2025-12-24T08:00:00Z", "approved");
      const list = await q.unusualEntries(NOW);
      const ids = list.map((r) => r.session.id);
      expect(ids).toContain(odd.id);
      expect(ids).not.toContain(ordinary.id);
      expect(ids).not.toContain(approved.id);
      expect(list.find((r) => r.session.id === odd.id)).toMatchObject({ userName: "other" });
      expect(list.find((r) => r.session.id === odd.id)!.flags).toContain("unusual_hours");
    });

    it("leaves out entries that already have a pending request", async () => {
      const q = await reqs();
      const e = await live(other, "2026-01-30T20:00:00Z", "2026-01-31T08:00:00Z");
      expect((await q.unusualEntries(NOW)).map((r) => r.session.id)).toContain(e.id);
      const r = await q.requestEdit(other, e.id, { inAt: "2026-01-30T15:00", outAt: "2026-01-30T22:30", reason: "Typo in the time" }, NOW);
      expect(r.ok).toBe(true);
      expect((await q.unusualEntries(NOW)).map((x) => x.session.id)).not.toContain(e.id);
    });

    it("markReviewed clears the flag once, and only for unreviewed entries", async () => {
      const q = await reqs();
      const a = await import("./attendance");
      const e = await live(other, "2025-12-28T20:00:00Z", "2025-12-29T08:00:00Z");
      expect((await q.markReviewed(lead, e.id)).ok).toBe(true);
      expect(await a.getSession(e.id)).toMatchObject({ reviewState: "approved" });
      expect((await q.unusualEntries(NOW)).map((r) => r.session.id)).not.toContain(e.id);
      expect((await q.markReviewed(lead, e.id)).ok).toBe(false);
    });
  });
});
