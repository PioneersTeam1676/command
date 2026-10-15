import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";
import { parseIcs } from "./ics";

const NY = "America/New_York";
const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${body}\r\nEND:VCALENDAR\r\n`;
const win = (from: string, to: string) => ({ from: new Date(from), to: new Date(to) });

describe("parseIcs", () => {
  it("reads a timed event with a timezone", () => {
    const ics = wrap(`BEGIN:VEVENT\r\nUID:one@x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART;TZID=America/New_York:20260210T180000\r\nDTEND;TZID=America/New_York:20260210T200000\r\nSUMMARY:Build day\r\nLOCATION:The shop\r\nDESCRIPTION:Bring safety glasses\r\nEND:VEVENT`);
    const [o] = parseIcs(ics, win("2026-01-01T00:00:00Z", "2026-06-01T00:00:00Z"), NY);
    expect(o).toMatchObject({ uid: "one@x", title: "Build day", location: "The shop", description: "Bring safety glasses", cancelled: false });
    expect(o!.startsAt.toISOString()).toBe("2026-02-10T23:00:00.000Z"); // 6 PM EST
    expect(o!.endsAt.toISOString()).toBe("2026-02-11T01:00:00.000Z");
  });

  it("expands a weekly rule into individual occurrences, honouring EXDATE and a moved instance", () => {
    const ics = wrap(
      [
        "BEGIN:VEVENT\r\nUID:weekly@x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART;TZID=America/New_York:20260105T180000\r\nDTEND;TZID=America/New_York:20260105T200000\r\nRRULE:FREQ=WEEKLY;COUNT=6\r\nEXDATE;TZID=America/New_York:20260119T180000\r\nSUMMARY:Practice\r\nEND:VEVENT",
        "BEGIN:VEVENT\r\nUID:weekly@x\r\nDTSTAMP:20260101T000000Z\r\nRECURRENCE-ID;TZID=America/New_York:20260126T180000\r\nDTSTART;TZID=America/New_York:20260126T190000\r\nDTEND;TZID=America/New_York:20260126T210000\r\nSUMMARY:Practice (late start)\r\nEND:VEVENT",
      ].join("\r\n"),
    );
    const occ = parseIcs(ics, win("2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"), NY);
    expect(occ).toHaveLength(5); // six weekly minus the excluded Jan 19
    expect(new Set(occ.map((o) => o.uid)).size).toBe(5); // each occurrence has its own id
    expect(occ.every((o) => o.uid.startsWith("weekly@x#"))).toBe(true);
    expect(occ.some((o) => o.startsAt.toISOString() === "2026-01-19T23:00:00.000Z")).toBe(false);
    const moved = occ.find((o) => o.title === "Practice (late start)");
    expect(moved!.startsAt.toISOString()).toBe("2026-01-27T00:00:00.000Z"); // 7 PM EST on Jan 26
  });

  it("keeps the local time constant across a DST change", () => {
    const ics = wrap(`BEGIN:VEVENT\r\nUID:dst@x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART;TZID=America/New_York:20260302T180000\r\nDTEND;TZID=America/New_York:20260302T200000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:DST test\r\nEND:VEVENT`);
    const occ = parseIcs(ics, win("2026-02-01T00:00:00Z", "2026-04-01T00:00:00Z"), NY);
    expect(occ.map((o) => o.startsAt.toISOString())).toEqual([
      "2026-03-02T23:00:00.000Z", // 6 PM EST
      "2026-03-09T22:00:00.000Z", // 6 PM EDT (clocks changed on Mar 8)
      "2026-03-16T22:00:00.000Z",
    ]);
  });

  it("handles all-day events, including multi-day, in the team timezone", () => {
    const ics = wrap(`BEGIN:VEVENT\r\nUID:allday@x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART;VALUE=DATE:20260214\r\nDTEND;VALUE=DATE:20260216\r\nSUMMARY:Regional\r\nEND:VEVENT`);
    const [o] = parseIcs(ics, win("2026-01-01T00:00:00Z", "2026-06-01T00:00:00Z"), NY);
    expect(o!.startsAt.toISOString()).toBe("2026-02-14T05:00:00.000Z"); // midnight Feb 14 in New York
    expect(o!.endsAt.toISOString()).toBe("2026-02-16T05:00:00.000Z"); // exclusive end: two days long
  });

  it("marks cancelled events, defaults a missing end to one hour, and drops events outside the window", () => {
    const ics = wrap(
      [
        "BEGIN:VEVENT\r\nUID:c@x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:20260210T230000Z\r\nDTEND:20260211T010000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Called off\r\nEND:VEVENT",
        "BEGIN:VEVENT\r\nUID:noend@x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:20260212T230000Z\r\nSUMMARY:No end\r\nEND:VEVENT",
        "BEGIN:VEVENT\r\nUID:far@x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:20300101T230000Z\r\nDTEND:20300102T010000Z\r\nSUMMARY:Way later\r\nEND:VEVENT",
      ].join("\r\n"),
    );
    const occ = parseIcs(ics, win("2026-01-01T00:00:00Z", "2026-06-01T00:00:00Z"), NY);
    expect(occ.map((o) => o.uid).sort()).toEqual(["c@x", "noend@x"]);
    expect(occ.find((o) => o.uid === "c@x")!.cancelled).toBe(true);
    const noEnd = occ.find((o) => o.uid === "noend@x")!;
    expect(noEnd.endsAt.getTime() - noEnd.startsAt.getTime()).toBe(3_600_000);
  });

  it("strips control characters and caps long text", () => {
    const ics = wrap(`BEGIN:VEVENT\r\nUID:t@x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:20260210T230000Z\r\nDTEND:20260211T010000Z\r\nSUMMARY:${"A".repeat(300)}\r\nEND:VEVENT`);
    const [o] = parseIcs(ics, win("2026-01-01T00:00:00Z", "2026-06-01T00:00:00Z"), NY);
    expect(o!.title).toHaveLength(120);
  });
});

describe.skipIf(!hasTestDb)("syncIcs", () => {
  let drop: () => Promise<void>;
  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "America/New_York", setupCompletedAt: new Date() });
    await db.insert(seasons).values({ name: "S", startDate: "2020-01-01", isCurrent: true });
    await db.insert(users).values({ email: "m@x.com", name: "M", status: "active" });
  });
  afterAll(async () => {
    await drop?.();
  });

  const NOW = new Date("2026-02-01T12:00:00Z");
  const ev = (uid: string, start: string, summary: string, extra = "") =>
    `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:${start}\r\nDTEND:${start.replace(/T(\d\d)/, (_m, h) => `T${String(Number(h) + 2).padStart(2, "0")}`)}\r\nSUMMARY:${summary}\r\n${extra}END:VEVENT`;
  const feed = (...events: string[]) => wrap(events.join("\r\n"));
  const run = async (text: string, now = NOW) => (await import("./ics")).syncIcs({ url: "http://127.0.0.1/cal.ics", now, allowPrivate: true, fetchText: async () => text });

  it("imports, then updates and cancels when the source changes, without duplicating", async () => {
    const { db } = await import("@/db");
    const { events, inAppNotifications } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const first = await run(feed(ev("a@x", "20260210T180000Z", "Practice"), ev("b@x", "20260212T180000Z", "Outreach")));
    expect(first).toMatchObject({ created: 2, updated: 0, cancelled: 0, firstSync: true });
    expect((await db.select().from(inAppNotifications)).length).toBe(0); // first import is silent
    // Synced events start plain: RSVP is something an admin opts in to per event.
    expect((await db.select().from(events)).every((e) => e.rsvpEnabled === false)).toBe(true);

    // Members set a check-in method on an imported event; it must survive re-syncs.
    await db.update(events).set({ verification: "code" }).where(eq(events.icsUid, "a@x"));

    const same = await run(feed(ev("a@x", "20260210T180000Z", "Practice"), ev("b@x", "20260212T180000Z", "Outreach")));
    expect(same).toMatchObject({ created: 0, updated: 0, cancelled: 0, unchanged: 2 });
    expect((await db.select().from(events)).length).toBe(2);

    // Rename a, drop b, add c.
    const changed = await run(feed(ev("a@x", "20260210T190000Z", "Practice (moved)"), ev("c@x", "20260214T180000Z", "Demo")));
    expect(changed).toMatchObject({ created: 1, updated: 1, cancelled: 1, firstSync: false });
    const rows = await db.select().from(events);
    const a = rows.find((r) => r.icsUid === "a@x")!;
    expect(a).toMatchObject({ title: "Practice (moved)", verification: "code", source: "imported" });
    expect(a.startsAt.toISOString()).toBe("2026-02-10T19:00:00.000Z");
    expect(rows.find((r) => r.icsUid === "b@x")!.cancelledAt).not.toBeNull();
    expect(rows.find((r) => r.icsUid === "c@x")!.cancelledAt).toBeNull();
    // Later changes do notify members (future events only).
    const titles = (await db.select().from(inAppNotifications)).map((n) => n.title);
    expect(titles.some((t) => t.includes("Demo"))).toBe(true);
    expect(titles.some((t) => t.includes("Outreach"))).toBe(true);

    // If b comes back, it un-cancels.
    await run(feed(ev("a@x", "20260210T190000Z", "Practice (moved)"), ev("b@x", "20260212T180000Z", "Outreach"), ev("c@x", "20260214T180000Z", "Demo")));
    expect((await db.select().from(events).where(eq(events.icsUid, "b@x")))[0]!.cancelledAt).toBeNull();
  });

  it("never cancels past events that vanished, and rejects non-calendar responses", async () => {
    const { db } = await import("@/db");
    const { events } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await run(feed(ev("old@x", "20260115T180000Z", "January thing"), ev("keep@x", "20260220T180000Z", "Keep")), new Date("2026-01-10T00:00:00Z"));
    await run(feed(ev("keep@x", "20260220T180000Z", "Keep")), new Date("2026-02-01T00:00:00Z")); // old@x is now in the past and gone from the feed
    expect((await db.select().from(events).where(eq(events.icsUid, "old@x")))[0]!.cancelledAt).toBeNull();
    await expect(run("<html>not a calendar</html>")).rejects.toThrow(/didn't return a calendar/);
  });

  it("refuses private addresses unless explicitly allowed", async () => {
    const { syncIcs } = await import("./ics");
    await expect(syncIcs({ url: "http://127.0.0.1/cal.ics", now: NOW, fetchText: async () => feed() })).rejects.toThrow(/private network/);
  });
});
