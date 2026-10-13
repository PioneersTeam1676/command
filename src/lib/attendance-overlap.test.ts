import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

const T = (s: string) => new Date(s);
const NOW = T("2026-02-01T00:00:00Z");

describe.skipIf(!hasTestDb)("attendance: overlaps and permanent delete", () => {
  let drop: () => Promise<void>;
  let kid: string;
  let lead: string;
  let eventId: string;
  let eventId2: string;

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons, events } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "America/New_York", setupCompletedAt: new Date() });
    const [s] = await db.insert(seasons).values({ name: "2026", startDate: "2026-01-01", isCurrent: true, buildStart: "2026-01-03", buildEnd: "2026-02-18" }).returning();
    const mk = async (key: string, role: "member" | "lead") => (await db.insert(users).values({ email: `${key}@x.com`, name: key, role, status: "active", createdAt: T("2025-12-01T00:00:00Z") }).returning({ id: users.id }))[0]!.id;
    kid = await mk("kid", "member");
    lead = await mk("lead", "lead");
    const ev = async (title: string, start: string, end: string) => (await db.insert(events).values({ seasonId: s!.id, title, startsAt: T(start), endsAt: T(end) }).returning({ id: events.id }))[0]!.id;
    eventId = await ev("Meeting", "2026-01-13T23:00:00Z", "2026-01-14T01:00:00Z");
    eventId2 = await ev("Outreach", "2026-01-13T23:30:00Z", "2026-01-14T00:30:00Z");
  });
  afterAll(async () => {
    await drop?.();
  });

  async function pair() {
    const a = await import("./attendance");
    const open = await a.addSessionForUser(lead, { userId: kid, kind: "open", inAt: T("2026-01-13T22:00:00Z"), outAt: T("2026-01-14T02:00:00Z") }, NOW);
    const ev = await a.addSessionForUser(lead, { userId: kid, kind: "event", eventId, inAt: T("2026-01-13T23:00:00Z"), outAt: T("2026-01-14T01:00:00Z") }, NOW);
    if (!open.ok) throw new Error(open.error);
    if (!ev.ok) throw new Error(ev.error);
    return { a, open: open.session, ev: ev.session };
  }

  it("lists overlapping pairs and refuses while one is running", async () => {
    const { a, open, ev } = await pair();
    const queue = await a.overlapQueue(NOW);
    expect(queue.map((q) => [q.a.id, q.b.id])).toContainEqual([open.id, ev.id]);
    expect(queue.every((q) => q.a.userName === "kid")).toBe(true);
    await a.deleteSessionForever(open.id);
    await a.deleteSessionForever(ev.id);
  });

  it("merge keeps the event entry and spans earliest in to latest out", async () => {
    const { a, open, ev } = await pair();
    const r = await a.resolveOverlap(lead, { aId: open.id, bId: ev.id, action: "merge" });
    expect(r.ok).toBe(true);
    expect(await a.getSession(open.id)).toBeUndefined();
    const kept = await a.getSession(ev.id);
    expect(kept).toMatchObject({ kind: "event", status: "edited", reviewState: "approved" });
    expect(kept!.clockInAt).toEqual(open.clockInAt);
    expect(kept!.clockOutAt).toEqual(open.clockOutAt);
    expect((await a.overlapQueue(NOW)).length).toBe(0);
    await a.deleteSessionForever(ev.id);
  });

  it("keep A / keep B remove the other and approve a pending survivor", async () => {
    const { a, open, ev } = await pair();
    expect((await a.resolveOverlap(lead, { aId: open.id, bId: ev.id, action: "keep_b" })).ok).toBe(true);
    expect(await a.getSession(open.id)).toBeUndefined();
    expect(await a.getSession(ev.id)).toMatchObject({ reviewState: "approved" });
    await a.deleteSessionForever(ev.id);

    const manual = await a.addBackfill(kid, { kind: "event", eventId, inAt: "2026-01-13T18:00", outAt: "2026-01-13T20:00" }, NOW);
    if (!manual.ok) throw new Error(manual.error);
    const live = await a.addSessionForUser(lead, { userId: kid, kind: "open", inAt: T("2026-01-13T23:30:00Z"), outAt: T("2026-01-14T00:30:00Z") }, NOW);
    if (!live.ok) throw new Error(live.error);
    expect((await a.resolveOverlap(lead, { aId: manual.session.id, bId: live.session.id, action: "keep_a" })).ok).toBe(true);
    expect(await a.getSession(manual.session.id)).toMatchObject({ reviewState: "approved", origin: "backfill" });
    await a.deleteSessionForever(manual.session.id);
  });

  it("won't merge two different events, running sessions, or a pair that no longer overlaps", async () => {
    const a = await import("./attendance");
    const e1 = await a.addSessionForUser(lead, { userId: kid, kind: "event", eventId, inAt: T("2026-01-13T23:00:00Z"), outAt: T("2026-01-14T01:00:00Z") }, NOW);
    const e2 = await a.addSessionForUser(lead, { userId: kid, kind: "event", eventId: eventId2, inAt: T("2026-01-13T23:30:00Z"), outAt: T("2026-01-14T00:30:00Z") }, NOW);
    if (!e1.ok) throw new Error(e1.error);
    if (!e2.ok) throw new Error(e2.error);
    expect((await a.resolveOverlap(lead, { aId: e1.session.id, bId: e2.session.id, action: "merge" })).ok).toBe(false);
    expect((await a.resolveOverlap(lead, { aId: e1.session.id, bId: e1.session.id, action: "keep_a" })).ok).toBe(false);
    const apart = await a.addSessionForUser(lead, { userId: kid, kind: "open", inAt: T("2026-01-20T20:00:00Z"), outAt: T("2026-01-20T21:00:00Z") }, NOW);
    if (!apart.ok) throw new Error("setup failed");
    expect((await a.resolveOverlap(lead, { aId: e1.session.id, bId: apart.session.id, action: "keep_a" })).ok).toBe(false);
    await a.deleteSessionForever(e1.session.id);
    await a.deleteSessionForever(e2.session.id);
    await a.deleteSessionForever(apart.session.id);
  });

  it("permanent delete leaves no row, audit entry, cached tap, or notice record", async () => {
    const a = await import("./attendance");
    const { db } = await import("@/db");
    const { auditLog, clientActions, notificationLog, attendanceSessions } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const added = await a.addSessionForUser(lead, { userId: kid, kind: "open", inAt: T("2026-01-21T20:00:00Z"), outAt: T("2026-01-21T21:00:00Z") }, NOW);
    if (!added.ok) throw new Error("setup failed");
    const id = added.session.id;
    await a.editSessionTimes(lead, id, { outAt: T("2026-01-21T22:00:00Z") }, NOW);
    await db.insert(clientActions).values({ id: `${kid}:tap-1`, userId: kid, result: { ok: true, session: { id } } });
    await db.insert(notificationLog).values({ userId: kid, type: "auto_clockout", dedupeKey: `auto:${id}`, result: "sent" });
    expect((await db.select().from(auditLog).where(eq(auditLog.targetId, id))).length).toBeGreaterThan(0);
    const auditTotalBefore = (await db.select().from(auditLog)).length;

    expect((await a.deleteSessionForever(id)).ok).toBe(true);

    expect(await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, id))).toHaveLength(0);
    expect(await db.select().from(auditLog).where(eq(auditLog.targetId, id))).toHaveLength(0);
    expect(await db.select().from(clientActions).where(eq(clientActions.id, `${kid}:tap-1`))).toHaveLength(0);
    expect(await db.select().from(notificationLog).where(eq(notificationLog.dedupeKey, `auto:${id}`))).toHaveLength(0);
    expect((await db.select().from(auditLog)).length).toBeLessThan(auditTotalBefore); // purged, and nothing new written
    expect((await a.deleteSessionForever(id)).ok).toBe(false); // already gone
  });
});
