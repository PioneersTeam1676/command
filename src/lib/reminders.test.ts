import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

const T = (s: string) => new Date(s);

describe.skipIf(!hasTestDb)("scheduled reminders", () => {
  let drop: () => Promise<void>;
  const u: Record<string, string> = {};
  const sent: { endpoint: string; title: string }[] = [];
  let eventId: string;

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons, pushSubscriptions, memberDays, events, rsvps } = await import("@/db/schema");
    const { setPushSenderForTests } = await import("./push");
    setPushSenderForTests(async (t, body) => {
      sent.push({ endpoint: t.endpoint, title: JSON.parse(body).title });
      return { statusCode: 201 };
    });
    await db.insert(teamSettings).values({ id: 1, timezone: "America/New_York", setupCompletedAt: new Date() });
    const [s] = await db.insert(seasons).values({ name: "2026", startDate: "2026-01-01", isCurrent: true, buildStart: "2026-01-03", buildEnd: "2026-02-18", workdays: [1, 2, 3, 4, 5] }).returning();
    const mk = async (key: string, role: "member" | "lead" | "admin" | "parent" = "member", status: "active" | "deactivated" = "active") => {
      const [r] = await db.insert(users).values({ email: `${key}@x.com`, name: key, role, status }).returning({ id: users.id });
      u[key] = r!.id;
      await db.insert(pushSubscriptions).values({ userId: r!.id, endpoint: `https://push/${key}`, p256dh: "k", auth: "a" });
    };
    await mk("a");
    await mk("b"); // skips Mondays
    await mk("c"); // already clocked in
    await mk("d", "member", "deactivated");
    await mk("p", "parent");
    await mk("lead", "lead");
    await db.insert(memberDays).values({ userId: u.b!, weekday: 1, attending: false });
    // c clocked in Monday Jan 12 at 3 PM local; a is clocked in and still in at the clock-out reminder time.
    const { attendanceSessions } = await import("@/db/schema");
    await db.insert(attendanceSessions).values({ userId: u.c!, seasonId: s!.id, kind: "open", localDate: "2026-01-12", clockInAt: T("2026-01-12T19:00:00Z"), clockOutAt: T("2026-01-12T20:00:00Z"), status: "closed" });
    // Event Tuesday Jan 13, 6-8 PM local (23:00Z-01:00Z)
    const [e] = await db.insert(events).values({ seasonId: s!.id, title: "Scrimmage", startsAt: T("2026-01-13T23:00:00Z"), endsAt: T("2026-01-14T01:00:00Z") }).returning();
    eventId = e!.id;
    await db.insert(rsvps).values([
      { eventId, userId: u.a!, response: "going" },
      { eventId, userId: u.b!, response: "maybe" },
      { eventId, userId: u.c!, response: "cant" },
      { eventId, userId: u.lead!, response: "going" },
    ]);
  });
  afterAll(async () => {
    const { setPushSenderForTests } = await import("./push");
    setPushSenderForTests(null);
    await drop?.();
  });

  const who = (title: string) => sent.filter((s) => s.title === title).map((s) => s.endpoint.replace("https://push/", "")).sort();

  it("daily reminder: only on a workday, only after the reminder time, skips opted-out, clocked-in and inactive users", async () => {
    const { runReminders } = await import("./reminders");
    // Monday Jan 12: reminder time is 3:30 PM local = 20:30Z.
    expect((await runReminders(T("2026-01-12T20:29:00Z"))).daily).toBe(0);
    const r = await runReminders(T("2026-01-12T20:31:00Z"));
    expect(r.daily).toBe(2); // a and lead
    expect(who("Time to clock in")).toEqual(["a", "lead"]);
  });

  it("duplicate scheduler ticks never double send", async () => {
    const { runReminders } = await import("./reminders");
    const before = sent.length;
    for (let i = 0; i < 3; i++) await runReminders(T("2026-01-12T20:40:00Z"));
    await Promise.all([runReminders(T("2026-01-12T20:45:00Z")), runReminders(T("2026-01-12T20:45:00Z"))]);
    expect(sent.length).toBe(before);
  });

  it("does not fire on a non-workday (Saturday) even inside the build range, or outside the build range", async () => {
    const { runReminders } = await import("./reminders");
    const before = sent.length;
    expect((await runReminders(T("2026-01-10T20:40:00Z"))).daily).toBe(0); // Saturday
    expect((await runReminders(T("2026-03-02T20:40:00Z"))).daily).toBe(0); // Monday after build season
    expect(sent.length).toBe(before);
  });

  it("doesn't send a stale daily reminder long after the window", async () => {
    const { runReminders } = await import("./reminders");
    expect((await runReminders(T("2026-01-19T23:30:00Z"))).daily).toBe(0); // Monday 6:30 PM local, > 2h after 3:30
  });

  it("clock-out reminder goes only to people still clocked in, once", async () => {
    const { runReminders } = await import("./reminders");
    const { db } = await import("@/db");
    const { attendanceSessions, seasons } = await import("@/db/schema");
    const [s] = await db.select().from(seasons);
    await db.insert(attendanceSessions).values({ userId: u.a!, seasonId: s!.id, kind: "open", localDate: "2026-01-12", clockInAt: T("2026-01-12T20:00:00Z"), status: "open" });
    expect((await runReminders(T("2026-01-13T01:29:00Z"))).clockout).toBe(0); // 8:29 PM local
    expect((await runReminders(T("2026-01-13T01:31:00Z"))).clockout).toBe(1); // 8:31 PM
    expect((await runReminders(T("2026-01-13T01:35:00Z"))).clockout).toBe(0);
    expect(who("Still clocked in?")).toEqual(["a"]);
  });

  it("event reminder to going/maybe only, once; check-in prompt skips people already checked in; clock-out prompt at end", async () => {
    const { runReminders } = await import("./reminders");
    const { db } = await import("@/db");
    const { attendanceSessions, seasons } = await import("@/db/schema");
    expect((await runReminders(T("2026-01-13T21:59:00Z"))).eventReminder).toBe(0); // 61 min before
    expect((await runReminders(T("2026-01-13T22:05:00Z"))).eventReminder).toBe(3); // a, b, lead
    expect((await runReminders(T("2026-01-13T22:10:00Z"))).eventReminder).toBe(0);
    expect(who("Scrimmage is coming up")).toEqual(["a", "b", "lead"]);

    const [s] = await db.select().from(seasons);
    await db.insert(attendanceSessions).values({ userId: u.b!, seasonId: s!.id, kind: "event", eventId, localDate: "2026-01-13", clockInAt: T("2026-01-13T22:40:00Z"), status: "open" });
    expect((await runReminders(T("2026-01-13T23:01:00Z"))).eventCheckin).toBe(2); // a and lead, not b (already in)
    expect(who("Scrimmage has started")).toEqual(["a", "lead"]);

    expect((await runReminders(T("2026-01-14T01:01:00Z"))).eventCheckout).toBe(1); // only b is still in
    expect(who("Scrimmage is over")).toEqual(["b"]);
  });

  it("respects per-type opt-out and never notifies cancelled events", async () => {
    const { runReminders } = await import("./reminders");
    const { db } = await import("@/db");
    const { notificationPrefs, events, rsvps, seasons } = await import("@/db/schema");
    const [s] = await db.select().from(seasons);
    const [e2] = await db.insert(events).values({ seasonId: s!.id, title: "Later", startsAt: T("2026-01-15T23:00:00Z"), endsAt: T("2026-01-16T01:00:00Z") }).returning();
    const [e3] = await db.insert(events).values({ seasonId: s!.id, title: "Nope", startsAt: T("2026-01-15T23:00:00Z"), endsAt: T("2026-01-16T01:00:00Z"), cancelledAt: T("2026-01-10T00:00:00Z") }).returning();
    await db.insert(rsvps).values([
      { eventId: e2!.id, userId: u.a!, response: "going" },
      { eventId: e2!.id, userId: u.lead!, response: "going" },
      { eventId: e3!.id, userId: u.a!, response: "going" },
    ]);
    await db.insert(notificationPrefs).values({ userId: u.a!, type: "event_reminder", enabled: false });
    const r = await runReminders(T("2026-01-15T22:10:00Z"));
    expect(r.eventReminder).toBe(1); // lead only
    expect(who("Later is coming up")).toEqual(["lead"]);
    expect(who("Nope is coming up")).toEqual([]);
  });
});
