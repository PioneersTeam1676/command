import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("events, attendance sign-ups, notifications", () => {
  let drop: () => Promise<void>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    const t = await createTestDb();
    drop = t.drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons, parentLinks } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "America/New_York", setupCompletedAt: new Date() });
    await db.insert(seasons).values({ name: "2026 Season", startDate: "2026-01-01", isCurrent: true });
    const mk = async (key: string, role: "member" | "lead" | "admin" | "parent", status: "active" | "pending" | "deactivated" = "active") => {
      const [r] = await db.insert(users).values({ email: `${key}@x.com`, name: key, role, status }).returning({ id: users.id });
      ids[key] = r!.id;
    };
    await mk("admin", "admin");
    await mk("lead", "lead");
    await mk("m1", "member");
    await mk("m2", "member");
    await mk("gone", "member", "deactivated");
    await mk("waiting", "member", "pending");
    await mk("mom", "parent");
    await mk("stranger", "parent");
    await db.insert(parentLinks).values({ parentId: ids.mom!, studentId: ids.m1!, relationship: "Mother", fullName: "Mom", status: "approved" });
    await db.insert(parentLinks).values({ parentId: ids.stranger!, studentId: ids.m2!, relationship: "Mother", fullName: "S", status: "pending" });
  });
  afterAll(async () => {
    await drop?.();
  });

  const future = (days: number, hour = 18) => {
    const d = new Date(Date.now() + days * 86_400_000);
    return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
  };

  it("creates an event in the team timezone and audits it", async () => {
    const { createEvent, getEvent } = await import("./events");
    const { db } = await import("@/db");
    const { auditLog } = await import("@/db/schema");
    const r = await createEvent(ids.lead!, { title: "Build day", startsAt: "2026-07-10T18:00", endsAt: "2026-07-10T20:30", verification: "inherit" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = await getEvent(r.id);
    expect(e!.startsAt.toISOString()).toBe("2026-07-10T22:00:00.000Z"); // 6 PM EDT
    expect((await db.select().from(auditLog)).some((a) => a.action === "event.create" && a.targetId === r.id)).toBe(true);
  });

  it("rejects bad times", async () => {
    const { createEvent } = await import("./events");
    expect((await createEvent(ids.lead!, { title: "x", startsAt: "2026-07-10T18:00", endsAt: "2026-07-10T17:00", verification: "inherit" })).ok).toBe(false);
    expect((await createEvent(ids.lead!, { title: "x", startsAt: "2026-07-10T18:00", endsAt: "2026-07-20T17:00", verification: "inherit" })).ok).toBe(false);
  });

  it("notifies active members and approved parents only, once per change", async () => {
    const { createEvent } = await import("./events");
    const { db } = await import("@/db");
    const { inAppNotifications } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const r = await createEvent(ids.admin!, { title: "Outreach", startsAt: future(3), endsAt: future(3, 20), verification: "none" });
    expect(r.ok).toBe(true);
    const got = async (k: string) => (await db.select().from(inAppNotifications).where(eq(inAppNotifications.userId, ids[k]!))).filter((n) => n.type === "event_change" && n.title.includes("Outreach")).length;
    expect(await got("m1")).toBe(1);
    expect(await got("m2")).toBe(1);
    expect(await got("lead")).toBe(1);
    expect(await got("mom")).toBe(1); // approved parent
    expect(await got("stranger")).toBe(0); // pending link
    expect(await got("gone")).toBe(0);
    expect(await got("waiting")).toBe(0);
  });

  it("edit and cancel notify; cancelled events stay and can't be edited", async () => {
    const { createEvent, updateEvent, cancelEvent, getEvent } = await import("./events");
    const { db } = await import("@/db");
    const { inAppNotifications } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const r = await createEvent(ids.lead!, { title: "Scrimmage", startsAt: future(4), endsAt: future(4, 21), verification: "inherit" });
    if (!r.ok) throw new Error("create failed");
    expect((await updateEvent(ids.lead!, r.id, { title: "Scrimmage (moved)", startsAt: future(5), endsAt: future(5, 21), verification: "inherit" })).ok).toBe(true);
    expect((await cancelEvent(ids.lead!, r.id)).ok).toBe(true);
    expect((await getEvent(r.id))!.cancelledAt).not.toBeNull();
    expect((await updateEvent(ids.lead!, r.id, { title: "Nope", startsAt: future(5), endsAt: future(5, 21), verification: "inherit" })).ok).toBe(false);
    const titles = (await db.select().from(inAppNotifications).where(eq(inAppNotifications.userId, ids.m1!))).map((n) => n.title);
    expect(titles.some((t) => t.startsWith("New event: Scrimmage"))).toBe(true);
    expect(titles.some((t) => t.startsWith("Event changed: Scrimmage"))).toBe(true);
    expect(titles.some((t) => t.startsWith("Event cancelled: Scrimmage"))).toBe(true);
  });

  it("delete removes an event, including its check-ins", async () => {
    const { createEvent, deleteEvent, getEvent } = await import("./events");
    const { setAttending } = await import("./attend");
    const { db } = await import("@/db");
    const { attendanceSessions, seasons } = await import("@/db/schema");
    const [season] = await db.select().from(seasons);
    const empty = await createEvent(ids.lead!, { title: "Oops duplicate", startsAt: future(6), endsAt: future(6, 20), verification: "none" });
    if (!empty.ok) throw new Error("create failed");
    await setAttending({ id: ids.m1!, role: "member" }, empty.id, true);
    expect((await deleteEvent(ids.lead!, empty.id)).ok).toBe(true);
    expect(await getEvent(empty.id)).toBeUndefined();

    const used = await createEvent(ids.lead!, { title: "Real meeting", startsAt: future(7), endsAt: future(7, 20), verification: "none" });
    if (!used.ok) throw new Error("create failed");
    await db.insert(attendanceSessions).values({ userId: ids.m1!, seasonId: season!.id, kind: "event", eventId: used.id, localDate: "2026-01-01", clockInAt: new Date(), status: "open" });
    expect((await deleteEvent(ids.admin!, used.id)).ok).toBe(true);
    expect(await getEvent(used.id)).toBeUndefined();
    expect((await deleteEvent(ids.lead!, "00000000-0000-4000-8000-000000000000")).ok).toBe(false);
  });

  it("imported events only allow changing the check-in method", async () => {
    const { updateEvent, getEvent } = await import("./events");
    const { db } = await import("@/db");
    const { events, seasons } = await import("@/db/schema");
    const [season] = await db.select().from(seasons);
    const [e] = await db.insert(events).values({ seasonId: season!.id, title: "From Google", startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000), source: "imported", icsUid: "abc" }).returning();
    expect((await updateEvent(ids.admin!, e!.id, { title: "Hacked", startsAt: future(1), endsAt: future(1, 22), verification: "code" })).ok).toBe(true);
    const after = await getEvent(e!.id);
    expect(after!.title).toBe("From Google");
    expect(after!.verification).toBe("code");
  });

  it("attending: sign up, change the note, leave, closed once over or cancelled; lists show who hasn't signed up", async () => {
    const { createEvent, cancelEvent } = await import("./events");
    const { attendLists, attendingCounts, myAttending, setAttending } = await import("./attend");
    const { db } = await import("@/db");
    const { events, seasons } = await import("@/db/schema");
    const r = await createEvent(ids.lead!, { title: "Sign up for me", startsAt: future(6), endsAt: future(6, 20), verification: "inherit" });
    if (!r.ok) throw new Error("create failed");
    const m1 = { id: ids.m1!, role: "member" as const };
    const m2 = { id: ids.m2!, role: "member" as const };
    expect((await setAttending(m1, r.id, true, "late")).ok).toBe(true);
    expect((await setAttending(m1, r.id, true, "  on time  ")).ok).toBe(true); // already going: just updates the note
    expect((await setAttending(m2, r.id, true)).ok).toBe(true);
    const lists = await attendLists(r.id);
    expect(lists.going.map((p) => p.name)).toEqual(["m1", "m2"]);
    expect(lists.going[0]!.note).toBe("on time");
    expect(lists.notYet.map((p) => p.name).sort()).toEqual(["admin", "lead"]); // active members only, no parents/pending/deactivated
    expect((await attendingCounts([r.id])).get(r.id)).toBe(2);
    expect([...(await myAttending(ids.m1!, [r.id]))]).toEqual([r.id]);

    expect((await setAttending(m1, r.id, false)).ok).toBe(true);
    expect((await attendLists(r.id)).going.map((p) => p.name)).toEqual(["m2"]);
    expect((await setAttending(m1, r.id, false)).ok).toBe(true); // leaving twice is harmless

    // A parent can't sign up to attend.
    const { users } = await import("@/db/schema");
    const [parent] = await db.select().from(users).where(eq(users.role, "parent"));
    if (parent) expect((await setAttending({ id: parent.id, role: "parent" }, r.id, true)).ok).toBe(false);

    // Ended event
    const [season] = await db.select().from(seasons);
    const [past] = await db.insert(events).values({ seasonId: season!.id, title: "Old", startsAt: new Date(Date.now() - 7_200_000), endsAt: new Date(Date.now() - 3_600_000) }).returning();
    expect((await setAttending(m1, past!.id, true)).ok).toBe(false);
    // Cancelled event
    await cancelEvent(ids.lead!, r.id);
    expect((await setAttending(m1, r.id, true)).ok).toBe(false);
  });

  it("an event that doesn't take sign-ups has no attend spot", async () => {
    const { createEvent } = await import("./events");
    const { setAttending } = await import("./attend");
    const r = await createEvent(ids.lead!, { title: "Mandatory", startsAt: future(8), endsAt: future(8, 20), verification: "inherit", rsvpEnabled: false });
    if (!r.ok) throw new Error("create failed");
    expect((await setAttending({ id: ids.m1!, role: "member" }, r.id, true)).ok).toBe(false);
  });
});
