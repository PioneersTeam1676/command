import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";
import { friendlyGoogleError, parseServiceAccount, type CalendarApi, type GEvent } from "./api";

describe("parseServiceAccount", () => {
  const key = "-----BEGIN PRIVATE KEY-----\\n" + "A".repeat(80) + "\\n-----END PRIVATE KEY-----\\n";
  it("accepts a key file and fixes escaped newlines", () => {
    const r = parseServiceAccount(JSON.stringify({ client_email: "svc@proj.iam.gserviceaccount.com", private_key: key }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.key).toContain("\n");
  });
  it("explains what's wrong in plain words", () => {
    expect(parseServiceAccount(undefined)).toMatchObject({ ok: false });
    expect(parseServiceAccount("{not json")).toMatchObject({ ok: false, error: expect.stringContaining("valid JSON") });
    expect(parseServiceAccount("{}")).toMatchObject({ ok: false, error: expect.stringContaining("client_email") });
  });
});

describe("friendlyGoogleError", () => {
  it("maps common failures to actions an admin can take", () => {
    expect(friendlyGoogleError({ code: 404 })).toContain("shared with the service account");
    expect(friendlyGoogleError({ code: 403 })).toContain("Make changes to events");
    expect(friendlyGoogleError({ message: "invalid_grant: Invalid JWT" })).toContain("fresh key file");
    expect(friendlyGoogleError({ message: "getaddrinfo ENOTFOUND www.googleapis.com" })).toContain("internet");
    expect(friendlyGoogleError({ message: "weird" })).toContain("weird");
  });
});

/** In-memory stand-in for the Google Calendar API. */
function fakeCalendar() {
  const store = new Map<string, GEvent>();
  const calls: string[] = [];
  let n = 0;
  let failNext: Error | null = null;
  const api: CalendarApi = {
    async get() {
      calls.push("get");
      return { summary: "Team Calendar" };
    },
    async insert(_c, body) {
      calls.push("insert");
      if (failNext) throw failNext;
      const id = `g${++n}`;
      store.set(id, { ...body, id });
      return { id };
    },
    async patch(_c, id, body) {
      calls.push("patch");
      if (failNext) throw failNext;
      store.set(id, { ...store.get(id), ...body, id });
      return { id };
    },
    async list(_c, p) {
      calls.push("list");
      const items = [...store.values()].filter((e) => !p.privateExtendedProperty || `commandEventId=${e.extendedProperties?.private?.commandEventId}` === p.privateExtendedProperty);
      return { items };
    },
  };
  return { api, store, calls, fail: (e: Error | null) => (failNext = e) };
}

describe.skipIf(!hasTestDb)("Google Calendar API mode", () => {
  let drop: () => Promise<void>;
  let adminId: string;
  const fake = fakeCalendar();

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    process.env.GOOGLE_CALENDAR_MODE = "api";
    process.env.GOOGLE_CALENDAR_ID = "team@group.calendar.google.com";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "America/New_York", setupCompletedAt: new Date() });
    await db.insert(seasons).values({ name: "S", startDate: "2020-01-01", isCurrent: true });
    adminId = (await db.insert(users).values({ email: "a@x.com", name: "A", role: "admin", status: "active" }).returning({ id: users.id }))[0]!.id;
    const { setCalendarApiForTests } = await import("./api");
    setCalendarApiForTests(fake.api);
  });
  afterAll(async () => {
    const { setCalendarApiForTests } = await import("./api");
    setCalendarApiForTests(null);
    await drop?.();
  });

  it("creating, editing and cancelling in Command pushes to Google and stores the id", async () => {
    const { createEvent, updateEvent, cancelEvent, getEvent } = await import("@/lib/events");
    const { pushEventToGoogle } = await import("./api");
    const r = await createEvent(adminId, { title: "Build Day", startsAt: "2026-07-10T18:00", endsAt: "2026-07-10T20:00", locationText: "Shop", verification: "inherit" });
    if (!r.ok) throw new Error("create failed");
    // createEvent queued a job; run the push the way the job does.
    expect(await pushEventToGoogle(r.id, "created")).toBe("created");
    const e = await getEvent(r.id);
    expect(e!.gcalEventId).toBe("g1");
    expect(fake.store.get("g1")).toMatchObject({ summary: "Build Day", location: "Shop", start: { dateTime: "2026-07-10T22:00:00.000Z", timeZone: "America/New_York" } });
    expect(fake.store.get("g1")!.extendedProperties!.private!.commandEventId).toBe(r.id);

    await updateEvent(adminId, r.id, { title: "Build Day (moved)", startsAt: "2026-07-11T18:00", endsAt: "2026-07-11T20:00", verification: "inherit" });
    expect(await pushEventToGoogle(r.id, "updated")).toBe("updated");
    expect(fake.store.get("g1")).toMatchObject({ summary: "Build Day (moved)" });
    expect(fake.store.size).toBe(1); // updated, not duplicated

    await cancelEvent(adminId, r.id);
    await pushEventToGoogle(r.id, "cancelled");
    expect(fake.store.get("g1")!.summary).toBe("[Cancelled] Build Day (moved)");
  });

  it("queues a push job when an event changes (API mode) and the retry can't create a duplicate", async () => {
    const { db } = await import("@/db");
    const { jobs, events } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { createEvent } = await import("@/lib/events");
    const { pushEventToGoogle } = await import("./api");
    const r = await createEvent(adminId, { title: "Retry me", startsAt: "2026-08-10T18:00", endsAt: "2026-08-10T20:00", verification: "inherit" });
    if (!r.ok) throw new Error("create failed");
    const queued = (await db.select().from(jobs).where(eq(jobs.kind, "gcal.push"))).filter((j) => (j.payload as { eventId?: string }).eventId === r.id);
    expect(queued).toHaveLength(1);

    // Google is down: the push throws (so the scheduler retries) and stores nothing.
    fake.fail(new Error("fetch failed"));
    await expect(pushEventToGoogle(r.id, "created")).rejects.toThrow();
    fake.fail(null);
    // Simulate "the insert worked but we crashed before saving the id": the event exists in Google already.
    fake.store.set("orphan", { id: "orphan", summary: "Retry me", extendedProperties: { private: { commandEventId: r.id } } });
    const before = fake.store.size;
    expect(await pushEventToGoogle(r.id, "created")).toBe("updated"); // found and adopted, not re-created
    expect(fake.store.size).toBe(before);
    expect((await db.select().from(events).where(eq(events.id, r.id)))[0]!.gcalEventId).toBe("orphan");
  });

  it("never pushes imported events back (no loops)", async () => {
    const { db } = await import("@/db");
    const { events, seasons } = await import("@/db/schema");
    const { pushEventToGoogle } = await import("./api");
    const [s] = await db.select().from(seasons);
    const [imp] = await db.insert(events).values({ seasonId: s!.id, title: "From Google", startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000), source: "imported", gcalEventId: "ext1" }).returning();
    const before = fake.calls.length;
    expect(await pushEventToGoogle(imp!.id, "updated")).toBe("skipped");
    expect(fake.calls.length).toBe(before);
  });

  it("imports past events once: skips duplicates, cancelled events and Command's own", async () => {
    const { db } = await import("@/db");
    const { events } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { importPastEvents } = await import("./api");
    fake.store.clear();
    fake.store.set("x1", { id: "x1", summary: "Old practice", start: { dateTime: "2026-01-10T23:00:00Z" }, end: { dateTime: "2026-01-11T01:00:00Z" } });
    fake.store.set("x2", { id: "x2", summary: "Old outreach", start: { date: "2026-01-12" }, end: { date: "2026-01-13" } });
    fake.store.set("x3", { id: "x3", summary: "Cancelled thing", status: "cancelled", start: { dateTime: "2026-01-14T23:00:00Z" }, end: { dateTime: "2026-01-15T01:00:00Z" } });
    fake.store.set("x4", { id: "x4", summary: "Made in Command", start: { dateTime: "2026-01-16T23:00:00Z" }, end: { dateTime: "2026-01-17T01:00:00Z" }, extendedProperties: { private: { commandEventId: "someid" } } });
    const first = await importPastEvents({ from: "2026-01-01", to: "2026-01-31" });
    expect(first).toMatchObject({ imported: 2, skippedCancelled: 1, skippedOwn: 1, skippedDuplicates: 0 });
    const second = await importPastEvents({ from: "2026-01-01", to: "2026-01-31" });
    expect(second).toMatchObject({ imported: 0, skippedDuplicates: 2 }); // repeatable, no duplicates
    const rows = await db.select().from(events).where(eq(events.source, "imported"));
    const allDay = rows.find((r) => r.gcalEventId === "x2")!;
    expect(allDay.startsAt.toISOString()).toBe("2026-01-12T05:00:00.000Z"); // midnight New York
    expect(allDay.endsAt.toISOString()).toBe("2026-01-13T05:00:00.000Z");
    expect(rows.every((r) => r.source === "imported")).toBe(true);
  });

  it("validates the import range", async () => {
    const { importPastEvents } = await import("./api");
    await expect(importPastEvents({ from: "2026-02-01", to: "2026-01-01" })).rejects.toThrow(/before/);
    await expect(importPastEvents({ from: "2020-01-01", to: "2026-01-01" })).rejects.toThrow(/year or less/);
    await expect(importPastEvents({ from: "yesterday", to: "today" })).rejects.toThrow(/Choose/);
  });

  it("test connection reports the calendar name, or a readable error", async () => {
    const { testApiConnection, setCalendarApiForTests } = await import("./api");
    expect(await testApiConnection()).toEqual({ ok: true, name: "Team Calendar" });
    setCalendarApiForTests({ ...fake.api, get: async () => Promise.reject(Object.assign(new Error("Not Found"), { code: 404 })) });
    const r = await testApiConnection();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("service account");
    setCalendarApiForTests(fake.api);
  });
});
