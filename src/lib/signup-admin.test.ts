import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("sign-ups: lead tools, reminders and export", () => {
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
  const entry = async (slotId: string, key: string) => {
    const { db } = await import("@/db");
    const { signupEntries } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");
    return (await db.select().from(signupEntries).where(and(eq(signupEntries.slotId, slotId), eq(signupEntries.userId, u[key]!))))[0];
  };
  const inbox = async (key: string, title: string) => {
    const { db } = await import("@/db");
    const { inAppNotifications } = await import("@/db/schema");
    return (await db.select().from(inAppNotifications)).filter((n) => n.userId === u[key] && n.title.includes(title));
  };
  /** Push-type reminders don't get inbox rows, so read the delivery log instead. */
  const logged = async (key: string, type: string, dedupePrefix: string) => {
    const { db } = await import("@/db");
    const { notificationLog } = await import("@/db/schema");
    return (await db.select().from(notificationLog)).filter((n) => n.userId === u[key] && n.type === type && n.dedupeKey.startsWith(dedupePrefix));
  };

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons, parentLinks, events } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "America/New_York", setupCompletedAt: new Date() });
    await db.insert(seasons).values({ name: "2026", startDate: "2026-01-01", isCurrent: true });
    const mk = async (key: string, role: "member" | "lead" | "admin" | "parent", status: "active" | "deactivated" = "active") => {
      u[key] = (await db.insert(users).values({ email: `${key}@x.com`, name: key, role, status }).returning({ id: users.id }))[0]!.id;
    };
    await mk("admin", "admin");
    await mk("lead", "lead");
    for (const k of ["a", "b", "c", "d"]) await mk(k, "member");
    await mk("gone", "member", "deactivated");
    await mk("mom", "parent");
    await mk("loner", "parent");
    await db.insert(parentLinks).values({ parentId: u.mom!, studentId: u.a!, relationship: "Mother", fullName: "Mom", status: "approved" });
    const { seasonForDate } = await import("./seasons");
    const season = await seasonForDate(new Date().toISOString().slice(0, 10));
    const [e] = await db.insert(events).values({ seasonId: season.id, title: "Regional", startsAt: new Date(Date.now() + 4 * 86_400_000), endsAt: new Date(Date.now() + 8 * 86_400_000) }).returning();
    eventId = e!.id;
    const s = await import("./signups");
    const sheet = await s.createSheet(u.lead!, eventId);
    if (!sheet.ok) throw new Error("sheet");
    sheetId = sheet.id;
    const g = await import("./groups");
    const grp = await g.createGroup(u.admin!, { name: "Super scouts" });
    if (!grp.ok) throw new Error("group");
    scouts = grp.id;
    await g.addGroupMembers(u.admin!, scouts, [u.a!, u.b!, u.gone!]);
  });
  afterAll(async () => {
    await drop?.();
  });

  // ---------- Placing people ----------

  it("places people directly, notifies them once, audits it, and marks who placed them", async () => {
    const admin = await import("./signup-admin");
    const slot = await mkSlot({ title: "Placed" });
    const r = await admin.assignPeople(u.lead!, slot, [u.a!, u.b!]);
    expect(r).toMatchObject({ ok: true, assigned: 2 });
    const e = await entry(slot, "a");
    expect(e).toMatchObject({ status: "confirmed", source: "admin", assignedBy: u.lead });
    expect(await inbox("a", "You've been added: Placed")).toHaveLength(1);
    await admin.assignPeople(u.lead!, slot, [u.a!]); // again: already on it, so nothing more to send
    expect(await inbox("a", "You've been added: Placed")).toHaveLength(1);
    const { db } = await import("@/db");
    const { auditLog } = await import("@/db/schema");
    expect((await db.select().from(auditLog)).some((x) => x.action === "signup.assign" && x.targetId === slot)).toBe(true);
  });

  it("refuses to go over capacity unless the lead says so, and never half-places", async () => {
    const admin = await import("./signup-admin");
    const slot = await mkSlot({ title: "Tight", capacity: 1 });
    const no = await admin.assignPeople(u.lead!, slot, [u.a!, u.b!]);
    expect(no.ok).toBe(false);
    expect(!no.ok && no.field).toBe("overbook");
    expect(await entry(slot, "a")).toBeUndefined();
    expect(await entry(slot, "b")).toBeUndefined();
    const yes = await admin.assignPeople(u.lead!, slot, [u.a!, u.b!], { overbook: true });
    expect(yes).toMatchObject({ ok: true, assigned: 2 });
  });

  it("moves someone from the waitlist onto the shift", async () => {
    const s = await import("./signups");
    const admin = await import("./signup-admin");
    const slot = await mkSlot({ title: "Queue jump", capacity: 1 });
    await s.claimSlot(viewer("a"), slot);
    await s.claimSlot(viewer("b"), slot);
    expect((await entry(slot, "b"))!.status).toBe("waitlisted");
    await admin.assignPeople(u.lead!, slot, [u.b!], { overbook: true });
    expect(await entry(slot, "b")).toMatchObject({ status: "confirmed", source: "admin" });
  });

  it("reports who it skipped and why, instead of failing the lot", async () => {
    const admin = await import("./signup-admin");
    const slot = await mkSlot({ title: "Members", audience: "members" });
    const r = await admin.assignPeople(u.lead!, slot, [u.c!, u.gone!, u.mom!, u.loner!]);
    expect(r.ok && r.assigned).toBe(1);
    const skipped = r.ok ? r.skipped : [];
    expect(skipped.find((x) => x.name === "gone")!.reason).toContain("isn't active");
    expect(skipped.find((x) => x.name === "mom")!.reason).toContain("team members");
    expect(skipped.find((x) => x.name === "loner")!.reason).toContain("team members");
  });

  it("only places a parent who has an approved student link", async () => {
    const admin = await import("./signup-admin");
    const slot = await mkSlot({ title: "Parents", audience: "parents" });
    const r = await admin.assignPeople(u.lead!, slot, [u.mom!, u.loner!]);
    expect(r.ok && r.assigned).toBe(1);
    expect((r.ok ? r.skipped : []).find((x) => x.name === "loner")!.reason).toContain("isn't approved");
    // A parent's link goes to the parent tree, not the member calendar.
    const { db } = await import("@/db");
    const { inAppNotifications } = await import("@/db/schema");
    const n = (await db.select().from(inAppNotifications)).find((x) => x.userId === u.mom && x.title.includes("Parents"))!;
    expect(n.url).toBe(`/parent/calendar/${eventId}`);
  });

  it("won't double-book someone, and ignores cancelled shifts when checking", async () => {
    const admin = await import("./signup-admin");
    const s = await import("./signups");
    const t1 = slotInput({ title: "Morning clash" });
    const t2 = slotInput({ title: "Overlapping", startsAt: t1.startsAt, endsAt: t1.endsAt });
    const a = await s.addSlot(u.lead!, sheetId, t1);
    const b = await s.addSlot(u.lead!, sheetId, t2);
    if (!a.ok || !b.ok) throw new Error("slots");
    await admin.assignPeople(u.lead!, a.id, [u.d!]);
    const r = await admin.assignPeople(u.lead!, b.id, [u.d!]);
    expect(r.ok && r.assigned).toBe(0);
    expect((r.ok ? r.skipped : [])[0]!.reason).toContain("Morning clash");
    await s.cancelSlot(u.lead!, a.id);
    expect((await admin.assignPeople(u.lead!, b.id, [u.d!])).ok && true).toBe(true);
    expect(await entry(b.id, "d")).toBeDefined();
  });

  it("places a whole group, skipping the deactivated", async () => {
    const admin = await import("./signup-admin");
    const slot = await mkSlot({ title: "Scout crew", capacity: 5 });
    const r = await admin.assignGroup(u.lead!, slot, scouts);
    expect(r).toMatchObject({ ok: true, assigned: 2 }); // a and b; "gone" isn't active so isn't even a member row that counts
    expect(await entry(slot, "gone")).toBeUndefined();
  });

  it("won't place anyone on a cancelled or finished shift", async () => {
    const admin = await import("./signup-admin");
    const s = await import("./signups");
    const slot = await mkSlot({ title: "Dead" });
    await s.cancelSlot(u.lead!, slot);
    expect((await admin.assignPeople(u.lead!, slot, [u.a!])).ok).toBe(false);
    const live = await mkSlot({ title: "Past" });
    const later = new Date(Date.now() + 30 * 86_400_000);
    expect((await admin.assignPeople(u.lead!, live, [u.a!], {}, later)).ok).toBe(false);
  });

  // ---------- Removing ----------

  it("removes a person, tells them, promotes the next in line, and audits it", async () => {
    const s = await import("./signups");
    const admin = await import("./signup-admin");
    const slot = await mkSlot({ title: "Trim", capacity: 1 });
    await s.claimSlot(viewer("a"), slot);
    await s.claimSlot(viewer("b"), slot);
    const r = await admin.removeEntry(u.lead!, (await entry(slot, "a"))!.id);
    expect(r.ok).toBe(true);
    expect(await entry(slot, "a")).toBeUndefined();
    expect((await entry(slot, "b"))!.status).toBe("confirmed");
    expect(await inbox("a", "You were taken off: Trim")).toHaveLength(1);
    expect(await inbox("b", "You're in: Trim")).toHaveLength(1);
    const { db } = await import("@/db");
    const { auditLog } = await import("@/db/schema");
    expect((await db.select().from(auditLog)).some((x) => x.action === "signup.remove" && x.targetId === slot)).toBe(true);
    expect((await admin.removeEntry(u.lead!, "00000000-0000-4000-8000-000000000000")).ok).toBe(false);
  });

  it("lists only people who could actually be placed", async () => {
    const admin = await import("./signup-admin");
    const slot = await mkSlot({ title: "Pool", audience: "parents", capacity: 3 });
    const names = (await admin.eligiblePeople(slot)).map((p) => p.name);
    expect(names).toContain("mom");
    expect(names).not.toContain("loner"); // no approved link
    expect(names).not.toContain("a"); // audience
    await admin.assignPeople(u.lead!, slot, [u.mom!]);
    expect((await admin.eligiblePeople(slot)).map((p) => p.name)).not.toContain("mom");
  });

  // ---------- Who hasn't signed up, and the nudge ----------

  it("finds people with no place on the sheet who could take an open shift, and nudges each once a day", async () => {
    const s = await import("./signups");
    const admin = await import("./signup-admin");
    const { db } = await import("@/db");
    const { events, seasons } = await import("@/db/schema");
    const { seasonForDate } = await import("./seasons");
    const season = await seasonForDate(new Date().toISOString().slice(0, 10));
    const [e] = await db.insert(events).values({ seasonId: season.id, title: "Nudge Fest", startsAt: new Date(Date.now() + 5 * 86_400_000), endsAt: new Date(Date.now() + 6 * 86_400_000) }).returning();
    void seasons;
    const sh = await s.createSheet(u.lead!, e!.id);
    if (!sh.ok) throw new Error("sheet");
    const open = await s.addSlot(u.lead!, sh.id, slotInput({ title: "Open one", capacity: 5 }));
    const mine = await s.addSlot(u.lead!, sh.id, slotInput({ title: "Parents' snacks", audience: "parents", capacity: 5 }));
    if (!open.ok || !mine.ok) throw new Error("slots");
    await s.claimSlot(viewer("c"), open.id);
    const unsigned = (await admin.unsignedPeople(sh.id)).map((p) => p.name).sort();
    expect(unsigned).toEqual(["a", "admin", "b", "d", "lead", "mom"]); // not c (signed up), not loner (unapproved), not gone (deactivated)
    const first = await admin.nudgeSheet(u.lead!, sh.id);
    expect(first).toMatchObject({ ok: true, reminded: 6, alreadyToday: false });
    expect(await inbox("a", "Shifts still open: Nudge Fest")).toHaveLength(1);
    expect((await inbox("mom", "Shifts still open"))[0]!.url).toBe(`/parent/calendar/${e!.id}`);
    expect(await inbox("c", "Shifts still open")).toHaveLength(0);
    const again = await admin.nudgeSheet(u.lead!, sh.id);
    expect(again).toMatchObject({ ok: true, reminded: 0, alreadyToday: true });
    expect(await inbox("a", "Shifts still open: Nudge Fest")).toHaveLength(1);
    // Nothing to nudge about once the sheet is closed.
    await s.setSheetClosed(u.lead!, sh.id, true);
    expect((await admin.nudgeSheet(u.lead!, sh.id)).ok).toBe(false);
    expect(await admin.unsignedPeople(sh.id)).toEqual([]);
  });

  it("doesn't count people who can't take a group-only shift yet", async () => {
    const s = await import("./signups");
    const admin = await import("./signup-admin");
    const { db } = await import("@/db");
    const { events } = await import("@/db/schema");
    const { seasonForDate } = await import("./seasons");
    const season = await seasonForDate(new Date().toISOString().slice(0, 10));
    const [e] = await db.insert(events).values({ seasonId: season.id, title: "Scout Only", startsAt: new Date(Date.now() + 5 * 86_400_000), endsAt: new Date(Date.now() + 6 * 86_400_000) }).returning();
    const sh = await s.createSheet(u.lead!, e!.id);
    if (!sh.ok) throw new Error("sheet");
    await s.addSlot(u.lead!, sh.id, slotInput({ title: "Scouts", groupIds: [scouts], capacity: 5 }));
    expect((await admin.unsignedPeople(sh.id)).map((p) => p.name).sort()).toEqual(["a", "b"]);
  });

  // ---------- Reminders and opening notices ----------

  it("sends a 24h and a 1h reminder, only to people already on the shift at that point, once each", async () => {
    const s = await import("./signups");
    const admin = await import("./signup-admin");
    const { db } = await import("@/db");
    const { events, signupSlots, signupEntries } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const { seasonForDate } = await import("./seasons");
    const season = await seasonForDate(new Date().toISOString().slice(0, 10));
    const start = new Date(Date.now() + 10 * 86_400_000);
    const [e] = await db.insert(events).values({ seasonId: season.id, title: "Remind Fest", startsAt: start, endsAt: new Date(start.getTime() + 8 * 3_600_000) }).returning();
    const sh = await s.createSheet(u.lead!, e!.id);
    if (!sh.ok) throw new Error("sheet");
    const added = await s.addSlot(u.lead!, sh.id, slotInput({ title: "Remind me", capacity: 5, startsAt: start.toISOString().slice(0, 16), endsAt: new Date(start.getTime() + 2 * 3_600_000).toISOString().slice(0, 16) }));
    if (!added.ok) throw new Error("slot");
    const [slot] = await db.select().from(signupSlots).where(eq(signupSlots.id, added.id));
    await s.claimSlot(viewer("a"), added.id);
    await s.claimSlot(viewer("b"), added.id);
    // b signed up only 30 minutes before it starts, so a "24h" or "1h" ping would be nonsense.
    await db.update(signupEntries).set({ createdAt: new Date(slot!.startsAt.getTime() - 30 * 60_000) }).where(and(eq(signupEntries.slotId, added.id), eq(signupEntries.userId, u.b!)));

    expect(await admin.runSignupNotices(new Date(slot!.startsAt.getTime() - 30 * 3_600_000))).toMatchObject({ reminders: 0 }); // too early
    const day = await admin.runSignupNotices(new Date(slot!.startsAt.getTime() - 23 * 3_600_000));
    expect(day.reminders).toBe(1);
    expect(await logged("a", "signup_reminder", `signup-remind:${added.id}:24h`)).toHaveLength(1);
    expect(await logged("b", "signup_reminder", `signup-remind:${added.id}:24h`)).toHaveLength(0);
    expect((await admin.runSignupNotices(new Date(slot!.startsAt.getTime() - 22 * 3_600_000))).reminders).toBe(0); // no repeat
    const hour = await admin.runSignupNotices(new Date(slot!.startsAt.getTime() - 50 * 60_000));
    expect(hour.reminders).toBe(1);
    expect(await logged("a", "signup_reminder", `signup-remind:${added.id}:1h`)).toHaveLength(1);
    expect(await logged("b", "signup_reminder", `signup-remind:${added.id}:1h`)).toHaveLength(0);
    // Reminders don't clutter the inbox.
    expect(await inbox("a", "Your shift")).toHaveLength(0);
  });

  it("doesn't remind for cancelled shifts, cancelled events or people who left", async () => {
    const s = await import("./signups");
    const admin = await import("./signup-admin");
    const { db } = await import("@/db");
    const { events, signupSlots } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { seasonForDate } = await import("./seasons");
    const season = await seasonForDate(new Date().toISOString().slice(0, 10));
    const start = new Date(Date.now() + 12 * 86_400_000);
    const [e] = await db.insert(events).values({ seasonId: season.id, title: "Cancel Fest", startsAt: start, endsAt: new Date(start.getTime() + 8 * 3_600_000) }).returning();
    const sh = await s.createSheet(u.lead!, e!.id);
    if (!sh.ok) throw new Error("sheet");
    const times = { startsAt: start.toISOString().slice(0, 16), endsAt: new Date(start.getTime() + 2 * 3_600_000).toISOString().slice(0, 16) };
    const one = await s.addSlot(u.lead!, sh.id, slotInput({ title: "Gone shift", capacity: 5, ...times }));
    const two = await s.addSlot(u.lead!, sh.id, slotInput({ title: "Left shift", capacity: 5, startsAt: new Date(start.getTime() + 3 * 3_600_000).toISOString().slice(0, 16), endsAt: new Date(start.getTime() + 5 * 3_600_000).toISOString().slice(0, 16) }));
    if (!one.ok || !two.ok) throw new Error("slots");
    await s.claimSlot(viewer("a"), one.id);
    await s.claimSlot(viewer("a"), two.id);
    await s.cancelSlot(u.lead!, one.id);
    await s.leaveSlot(viewer("a"), two.id);
    const [row] = await db.select().from(signupSlots).where(eq(signupSlots.id, one.id));
    const r = await admin.runSignupNotices(new Date(row!.startsAt.getTime() - 50 * 60_000));
    expect(r.reminders).toBe(0);
  });

  it("tells everyone else when a group's priority window ends, once, and skips the group who already knew", async () => {
    const s = await import("./signups");
    const admin = await import("./signup-admin");
    const { db } = await import("@/db");
    const { signupSlots } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const slot = await mkSlot({ title: "Priority open", capacity: 5, groupIds: [scouts], opensToAllAt: inDays(3, 12) });
    void s;
    const [row] = await db.select().from(signupSlots).where(eq(signupSlots.id, slot));
    const opens = row!.opensToAllAt!;
    expect((await admin.runSignupNotices(new Date(opens.getTime() - 60_000))).opened).toBe(0);
    const after = new Date(opens.getTime() + 60_000);
    const r = await admin.runSignupNotices(after);
    expect(r.opened).toBeGreaterThan(0);
    expect(await logged("c", "signup_open", `signup-open:${slot}`)).toHaveLength(1);
    expect(await logged("a", "signup_open", `signup-open:${slot}`)).toHaveLength(0); // in the group, already had first pick
    expect((await admin.runSignupNotices(new Date(opens.getTime() + 120_000))).opened).toBe(0); // never twice
  });

  it("tells a group's members they have first pick when the shift is created", async () => {
    const admin = await import("./signup-admin");
    const slot = await mkSlot({ title: "First pick shift", capacity: 3, groupIds: [scouts], opensToAllAt: inDays(3, 15) });
    await admin.notifyFirstPickById(slot);
    expect(await inbox("a", "First pick: First pick shift")).toHaveLength(1);
    expect(await inbox("c", "First pick: First pick shift")).toHaveLength(0);
    expect(await inbox("gone", "First pick: First pick shift")).toHaveLength(0);
    await admin.notifyFirstPickById(slot);
    expect(await inbox("a", "First pick: First pick shift")).toHaveLength(1);
  });

  // ---------- Export ----------

  it("exports one row per place or queue spot, with who placed them", async () => {
    const admin = await import("./signup-admin");
    const s = await import("./signups");
    const queued = await mkSlot({ title: "Export queue", capacity: 1 });
    await s.claimSlot(viewer("a"), queued);
    await s.claimSlot(viewer("b"), queued);
    const { getCurrentSeason } = await import("./seasons");
    const season = await getCurrentSeason();
    const res = await admin.exportSignups(season.id, "America/New_York");
    const text = await res!.text();
    const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
    expect(lines[0]).toContain("Event,Event starts,Shift");
    expect(lines.length).toBeGreaterThan(5);
    expect(text).toContain("placed by a lead");
    expect(text).toContain("signed up themselves");
    expect(text).toContain("waitlisted");
    expect(await admin.exportSignups("00000000-0000-4000-8000-000000000000", "UTC")).toBeNull();
  });
});
