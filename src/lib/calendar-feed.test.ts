import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("my shifts, open shifts and the personal calendar feed", () => {
  let drop: () => Promise<void>;
  const u: Record<string, string> = {};
  let sheetId: string;
  let eventId: string;
  let scouts: string;

  const inDays = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * 86_400_000);
    return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
  };
  let hour = 0;
  const slotInput = (over: Partial<import("./signups").SlotFormInput> = {}) => {
    hour += 1;
    return { title: `Slot ${hour}`, startsAt: inDays(6, hour), endsAt: inDays(6, hour + 1), capacity: 2, audience: "anyone" as const, ...over };
  };
  const viewer = (key: string, role: "member" | "lead" | "admin" | "parent" = "member") => ({ id: u[key]!, role });
  const mkSlot = async (over: Partial<import("./signups").SlotFormInput> = {}) => {
    const s = await import("./signups");
    const r = await s.addSlot(u.lead!, sheetId, slotInput(over));
    if (!r.ok) throw new Error(r.error);
    return r.id;
  };

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons, parentLinks, events } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, name: "Test Robotics", timezone: "America/New_York", setupCompletedAt: new Date() });
    await db.insert(seasons).values({ name: "2026", startDate: "2026-01-01", isCurrent: true });
    const mk = async (key: string, role: "member" | "lead" | "admin" | "parent", status: "active" | "deactivated" = "active") => {
      u[key] = (await db.insert(users).values({ email: `${key}@x.com`, name: key, role, status }).returning({ id: users.id }))[0]!.id;
    };
    await mk("admin", "admin");
    await mk("lead", "lead");
    for (const k of ["a", "b", "c"]) await mk(k, "member");
    await mk("mom", "parent");
    await mk("loner", "parent");
    await db.insert(parentLinks).values({ parentId: u.mom!, studentId: u.a!, relationship: "Mother", fullName: "Mom", status: "approved" });
    const { seasonForDate } = await import("./seasons");
    const season = await seasonForDate(new Date().toISOString().slice(0, 10));
    const [e] = await db.insert(events).values({ seasonId: season.id, title: "Regional", locationText: "Convention Center, Hall B", startsAt: new Date(Date.now() + 4 * 86_400_000), endsAt: new Date(Date.now() + 8 * 86_400_000) }).returning();
    eventId = e!.id;
    const s = await import("./signups");
    const sheet = await s.createSheet(u.lead!, eventId);
    if (!sheet.ok) throw new Error("sheet");
    sheetId = sheet.id;
    const g = await import("./groups");
    const grp = await g.createGroup(u.admin!, { name: "Super scouts" });
    if (!grp.ok) throw new Error("group");
    scouts = grp.id;
    await g.addGroupMembers(u.admin!, scouts, [u.b!]);
  });
  afterAll(async () => {
    await drop?.();
  });

  // ---------- My shifts ----------

  it("lists what someone holds and where they sit in a queue, hides cancelled shifts, and only lets them leave before it starts", async () => {
    const s = await import("./signups");
    const shifts = await import("./my-shifts");
    const held = await mkSlot({ title: "Held" });
    const full = await mkSlot({ title: "Full", capacity: 1 });
    const gone = await mkSlot({ title: "Cancelled one" });
    await s.claimSlot(viewer("a"), held);
    await s.claimSlot(viewer("b"), full);
    await s.claimSlot(viewer("c"), full);
    await s.claimSlot(viewer("a"), full); // a is second in line
    await s.claimSlot(viewer("a"), gone);
    await s.cancelSlot(u.lead!, gone);

    const mine = await shifts.myShifts(u.a!);
    expect(mine.upcoming.map((m) => m.slot.title).sort()).toEqual(["Full", "Held"]);
    const f = mine.upcoming.find((m) => m.slot.title === "Full")!;
    expect(f).toMatchObject({ status: "waitlisted", position: 2, eventTitle: "Regional", locationText: "Convention Center, Hall B", canLeave: true });
    expect(mine.upcoming.find((m) => m.slot.title === "Held")).toMatchObject({ status: "confirmed", position: null });
    // Once it has started they can't just walk away.
    const later = await shifts.myShifts(u.a!, new Date(f.slot.startsAt.getTime() + 60_000));
    expect(later.upcoming.find((m) => m.slot.title === "Full")!.canLeave).toBe(false);
    // A shift that's over moves to history, and only confirmed ones count as history.
    const after = await shifts.myShifts(u.a!, new Date(Date.now() + 30 * 86_400_000));
    expect(after.upcoming).toHaveLength(0);
    expect(after.past.map((m) => m.slot.title)).toEqual(["Held"]);
  });

  it("stops offering to leave once the sheet is closed", async () => {
    const s = await import("./signups");
    const shifts = await import("./my-shifts");
    const slot = await mkSlot({ title: "Closable" });
    await s.claimSlot(viewer("c"), slot);
    await s.setSheetClosed(u.lead!, sheetId, true);
    expect((await shifts.myShifts(u.c!)).upcoming.find((m) => m.slot.title === "Closable")!.canLeave).toBe(false);
    await s.setSheetClosed(u.lead!, sheetId, false);
  });

  // ---------- Shifts you can take ----------

  it("offers only shifts a person could really claim now", async () => {
    const s = await import("./signups");
    const shifts = await import("./my-shifts");
    const open = await mkSlot({ title: "Open to all", capacity: 3 });
    const noWait = await mkSlot({ title: "Full no waitlist", capacity: 1, waitlistEnabled: false });
    const waitOnly = await mkSlot({ title: "Full with waitlist", capacity: 1 });
    const parentsOnly = await mkSlot({ title: "Parents only", audience: "parents" });
    const scoutOnly = await mkSlot({ title: "Scouts only", groupIds: [scouts] });
    const early = await mkSlot({ title: "Scouts first", groupIds: [scouts], opensToAllAt: inDays(3, 12) });
    void open; void parentsOnly; void scoutOnly; void early;
    await s.claimSlot(viewer("admin"), noWait);
    await s.claimSlot(viewer("admin"), waitOnly);

    const forA = (await shifts.openShiftsFor(viewer("a"))).map((o) => o.slot.title);
    expect(forA).toContain("Open to all");
    expect(forA).toContain("Full with waitlist");
    expect(forA).not.toContain("Full no waitlist");
    expect(forA).not.toContain("Parents only");
    expect(forA).not.toContain("Scouts only");
    // The priority window is still running, so only the group is offered it.
    expect(forA).not.toContain("Scouts first");
    const forB = (await shifts.openShiftsFor(viewer("b"))).map((o) => o.slot.title);
    expect(forB).toContain("Scouts first");
    expect(forB).toContain("Scouts only");
  });

  it("doesn't offer what someone already holds or what would clash with it", async () => {
    const s = await import("./signups");
    const shifts = await import("./my-shifts");
    const t1 = slotInput({ title: "Mine", capacity: 3 });
    const t2 = slotInput({ title: "Clashes with mine", capacity: 3, startsAt: t1.startsAt, endsAt: t1.endsAt });
    const a = await s.addSlot(u.lead!, sheetId, t1);
    const b = await s.addSlot(u.lead!, sheetId, t2);
    if (!a.ok || !b.ok) throw new Error("slots");
    await s.claimSlot(viewer("c"), a.id);
    const titles = (await shifts.openShiftsFor(viewer("c"))).map((o) => o.slot.title);
    expect(titles).not.toContain("Mine");
    expect(titles).not.toContain("Clashes with mine");
    expect((await shifts.openShiftsFor(viewer("a"))).map((o) => o.slot.title)).toContain("Clashes with mine");
  });

  it("offers a parent parent-friendly shifts only once their student link is approved", async () => {
    const shifts = await import("./my-shifts");
    const mine = (await shifts.openShiftsFor(viewer("mom", "parent"))).map((o) => o.slot.title);
    expect(mine).toContain("Parents only");
    expect(mine).not.toContain("Open to all" + "!"); // sanity: audience "anyone" is fine, just not this made-up title
    expect((await shifts.openShiftsFor(viewer("loner", "parent")))).toEqual([]);
  });

  it("counts open and held shifts per event for the calendar badges", async () => {
    const shifts = await import("./my-shifts");
    const info = await shifts.calendarShiftInfo(viewer("c"));
    expect(info.get(eventId)!.open).toBeGreaterThan(0);
    expect(info.get(eventId)!.mine).toBeGreaterThan(0);
    expect((await shifts.calendarShiftInfo(viewer("loner", "parent"))).size).toBe(0);
  });

  // ---------- The calendar feed ----------

  it("makes a feed whose secret is stored only as a hash, and resetting kills the old address", async () => {
    const feed = await import("./calendar-feed");
    const { db } = await import("@/db");
    const { calendarFeeds } = await import("@/db/schema");
    expect(await feed.feedStatus(u.a!)).toEqual({ exists: false });
    const t1 = await feed.resetFeed(u.a!);
    expect(feed.feedUrl(t1)).toBe(`http://localhost:3000/api/calendar/shifts/${t1}.ics`);
    const [row] = await db.select().from(calendarFeeds);
    expect(row!.tokenHash).not.toContain(t1);
    expect(JSON.stringify(row)).not.toContain(t1);
    expect(await feed.userForFeedToken(t1)).toMatchObject({ id: u.a });
    expect(await feed.userForFeedToken(`${t1}.ics`)).toMatchObject({ id: u.a }); // the .ics suffix is fine
    const t2 = await feed.resetFeed(u.a!);
    expect(t2).not.toBe(t1);
    expect(await feed.userForFeedToken(t1)).toBeNull();
    expect(await feed.userForFeedToken(t2)).toMatchObject({ id: u.a });
    expect((await feed.feedStatus(u.a!)).exists).toBe(true);
  });

  it("rejects malformed, unknown and revoked tokens with the same answer", async () => {
    const feed = await import("./calendar-feed");
    for (const bad of ["", "short", "../../etc/passwd", "a".repeat(80), "x".repeat(32), "!!!!!!!!!!!!!!!!!!!!!!!!"]) expect(await feed.userForFeedToken(bad)).toBeNull();
    const t = await feed.resetFeed(u.b!);
    await feed.revokeFeed(u.b!);
    expect(await feed.userForFeedToken(t)).toBeNull();
  });

  it("stops serving a feed once its owner is deactivated", async () => {
    const feed = await import("./calendar-feed");
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const t = await feed.resetFeed(u.c!);
    expect(await feed.userForFeedToken(t)).not.toBeNull();
    await db.update(users).set({ status: "deactivated" }).where(eq(users.id, u.c!));
    expect(await feed.userForFeedToken(t)).toBeNull();
    await db.update(users).set({ status: "active" }).where(eq(users.id, u.c!));
  });

  it("the feed lists this person's own shifts only, with waitlisted as tentative and cancelled marked cancelled", async () => {
    const s = await import("./signups");
    const feed = await import("./calendar-feed");
    const fresh = await mkSlot({ title: "Feed shift", capacity: 1 });
    const other = await mkSlot({ title: "Somebody else's", capacity: 3 });
    const doomed = await mkSlot({ title: "Feed doomed", capacity: 3 });
    await s.claimSlot(viewer("c"), fresh);
    await s.claimSlot(viewer("a"), fresh); // a is waitlisted
    await s.claimSlot(viewer("b"), other);
    await s.claimSlot(viewer("a"), doomed);
    await s.cancelSlot(u.lead!, doomed);

    const ics = await feed.shiftsIcs(viewer("a"));
    expect(ics).toContain("X-WR-CALNAME:Test Robotics shifts");
    expect(ics).toContain("SUMMARY:Waitlist: Feed shift (Regional)");
    expect(ics).toContain("STATUS:TENTATIVE");
    expect(ics).toContain("SUMMARY:Cancelled: Feed doomed (Regional)");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("LOCATION:Convention Center\\, Hall B"); // the comma in the venue name is escaped
    expect(ics).not.toContain("Somebody else's");
    expect(ics).toContain(`URL:http://localhost:3000/calendar/${eventId}`);
    // Each entry has its own stable id, so re-syncing updates rather than duplicates.
    const uids = ics.match(/^UID:.*$/gm)!;
    expect(new Set(uids).size).toBe(uids.length);

    await s.leaveSlot(viewer("c"), fresh); // a is promoted
    const promoted = await feed.shiftsIcs(viewer("a"));
    expect(promoted).toContain("SUMMARY:Feed shift (Regional)");
    expect(promoted).toMatch(/SUMMARY:Feed shift \(Regional\)[\s\S]*?STATUS:CONFIRMED[\s\S]*?SEQUENCE:1/);
  });

  it("gives a parent links to the parent route tree, and an empty but valid calendar to someone with no shifts", async () => {
    const s = await import("./signups");
    const feed = await import("./calendar-feed");
    const slot = await mkSlot({ title: "Parent feed shift", audience: "parents" });
    const claimed = await s.claimSlot(viewer("mom", "parent"), slot);
    expect(claimed).toMatchObject({ ok: true });
    // Long lines are folded at 75 bytes (CRLF + space), so unfold before looking for the link.
    const unfolded = (await feed.shiftsIcs(viewer("mom", "parent"))).replace(/\r\n /g, "");
    expect(unfolded).toContain(`URL:http://localhost:3000/parent/calendar/${eventId}`);
    const empty = await feed.shiftsIcs(viewer("loner", "parent"));
    expect(empty).toContain("BEGIN:VCALENDAR");
    expect(empty).not.toContain("BEGIN:VEVENT");
  });

  it("erasing a person's data removes their feed", async () => {
    const feed = await import("./calendar-feed");
    const users = await import("./users");
    const { db } = await import("@/db");
    const { users: usersTable } = await import("@/db/schema");
    const [v] = await db.insert(usersTable).values({ email: "leaver@x.com", name: "leaver", role: "member", status: "active" }).returning({ id: usersTable.id });
    const t = await feed.resetFeed(v!.id);
    expect((await users.erasePersonalData(u.admin!, v!.id)).ok).toBe(true);
    expect(await feed.userForFeedToken(t)).toBeNull();
    expect(await feed.feedStatus(v!.id)).toEqual({ exists: false });
  });
});
