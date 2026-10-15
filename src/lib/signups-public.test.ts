import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("sign-ups: public shifts page and who's on each shift", () => {
  let drop: () => Promise<void>;
  const u: Record<string, string> = {};
  let eventId: string;
  let cancelledEventId: string;
  let sheetId: string;
  let groupId: string;

  const inDays = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * 86_400_000);
    return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
  };
  const slotInput = (over: Partial<import("./signups").SlotFormInput> = {}) => ({ title: "Pit crew", startsAt: inDays(5, 9), endsAt: inDays(5, 11), capacity: 2, audience: "anyone" as const, ...over });
  const viewer = (key: string, role: "member" | "lead" | "admin" | "parent" = "member") => ({ id: u[key]!, role });

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons, parentLinks, events, groups } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "America/New_York", setupCompletedAt: new Date() });
    await db.insert(seasons).values({ name: "2026", startDate: "2026-01-01", isCurrent: true });
    const mk = async (key: string, role: "member" | "lead" | "parent") => {
      u[key] = (await db.insert(users).values({ email: `${key}@x.com`, name: key, role, status: "active" }).returning({ id: users.id }))[0]!.id;
    };
    await mk("lead", "lead");
    for (const k of ["ada", "ben", "cy", "dee", "eli", "fay"]) await mk(k, "member");
    await mk("mom", "parent");
    await db.insert(parentLinks).values({ parentId: u.mom!, studentId: u.ada!, relationship: "Mother", fullName: "Mom", status: "approved" });
    const { seasonForDate } = await import("./seasons");
    const season = await seasonForDate(new Date().toISOString().slice(0, 10));
    const [e] = await db.insert(events).values({ seasonId: season.id, title: "Regional", locationText: "Convention Center", startsAt: new Date(Date.now() + 4 * 86_400_000), endsAt: new Date(Date.now() + 6 * 86_400_000) }).returning();
    eventId = e!.id;
    const [c] = await db.insert(events).values({ seasonId: season.id, title: "Cancelled", startsAt: new Date(Date.now() + 4 * 86_400_000), endsAt: new Date(Date.now() + 5 * 86_400_000) }).returning();
    cancelledEventId = c!.id;
    const [g] = await db.insert(groups).values({ name: "Drive team" }).returning();
    groupId = g!.id;
    const s = await import("./signups");
    const sheet = await s.createSheet(u.lead!, eventId);
    if (!sheet.ok) throw new Error("sheet");
    sheetId = sheet.id;
    const cs = await s.createSheet(u.lead!, cancelledEventId);
    if (!cs.ok) throw new Error("sheet");
    await s.addSlot(u.lead!, cs.id, slotInput({ title: "Never happens" }));
    await db.update(events).set({ cancelledAt: new Date() }).where(eq(events.id, cancelledEventId));
  });
  afterAll(async () => {
    await drop?.();
  });

  const slot = async (over: Partial<import("./signups").SlotFormInput> = {}) => {
    const s = await import("./signups");
    const r = await s.addSlot(u.lead!, sheetId, slotInput(over));
    if (!r.ok) throw new Error(r.error);
    return r.id;
  };

  describe("getPublicShiftView", () => {
    it("shows the event and counts for shifts open to anyone, with no names", async () => {
      const s = await import("./signups");
      const id = await slot({ title: "Booth", capacity: 3 });
      await s.claimSlot(viewer("ada"), id);
      await s.claimSlot(viewer("ben"), id);
      const view = await s.getPublicShiftView(eventId);
      expect(view).not.toBeNull();
      expect(view!.event).toMatchObject({ title: "Regional", locationText: "Convention Center", cancelled: false });
      const booth = view!.slots.find((x) => x.title === "Booth")!;
      expect(booth).toMatchObject({ capacity: 3, filled: 2, kind: "shift" });
      const json = JSON.stringify(view);
      for (const name of ["ada", "ben", "ada@x.com"]) expect(json).not.toContain(name);
    });

    it("leaves out members-only and parents-only shifts, cancelled shifts, and reserved-for-a-group shifts", async () => {
      const s = await import("./signups");
      await slot({ title: "Members only", audience: "members" });
      await slot({ title: "Parents only", audience: "parents" });
      const cancelled = await slot({ title: "Called off" });
      await s.cancelSlot(u.lead!, cancelled);
      await slot({ title: "Drive team only", groupIds: [groupId] });
      const titles = (await s.getPublicShiftView(eventId))!.slots.map((x) => x.title);
      expect(titles).toContain("Booth");
      for (const t of ["Members only", "Parents only", "Called off", "Drive team only"]) expect(titles).not.toContain(t);
    });

    it("never includes private notes, the sign-up note text or descriptions", async () => {
      const s = await import("./signups");
      await slot({ title: "Described", description: "Door code is 4821" });
      expect(JSON.stringify(await s.getPublicShiftView(eventId))).not.toContain("4821");
    });

    it("marks a full shift as full, and says whether a waitlist is open", async () => {
      const s = await import("./signups");
      const id = await slot({ title: "Tiny", capacity: 1, waitlistEnabled: true });
      await s.claimSlot(viewer("cy"), id);
      const tiny = (await s.getPublicShiftView(eventId))!.slots.find((x) => x.title === "Tiny")!;
      expect(tiny).toMatchObject({ filled: 1, capacity: 1, full: true, waitlist: true });
    });

    it("returns nothing when no shift is open to everyone, so the page never exposes an event that isn't being shared", async () => {
      const s = await import("./signups");
      const { db } = await import("@/db");
      const { events } = await import("@/db/schema");
      const { seasonForDate } = await import("./seasons");
      const season = await seasonForDate(new Date().toISOString().slice(0, 10));
      const [e] = await db.insert(events).values({ seasonId: season.id, title: "Crew only", startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000) }).returning();
      const sheet = await s.createSheet(u.lead!, e!.id);
      if (!sheet.ok) throw new Error("sheet");
      await s.addSlot(u.lead!, sheet.id, slotInput({ title: "Members only", audience: "members" }));
      expect(await s.getPublicShiftView(e!.id)).toBeNull();
    });

    it("returns nothing for an event without a sheet or that doesn't exist, and flags a cancelled event", async () => {
      const s = await import("./signups");
      const { db } = await import("@/db");
      const { events } = await import("@/db/schema");
      const { seasonForDate } = await import("./seasons");
      const season = await seasonForDate(new Date().toISOString().slice(0, 10));
      const [bare] = await db.insert(events).values({ seasonId: season.id, title: "No sheet", startsAt: new Date(), endsAt: new Date(Date.now() + 3_600_000) }).returning();
      expect(await s.getPublicShiftView(bare!.id)).toBeNull();
      expect(await s.getPublicShiftView("00000000-0000-4000-8000-000000000000")).toBeNull();
      const cancelled = await s.getPublicShiftView(cancelledEventId);
      expect(cancelled!.event.cancelled).toBe(true);
      expect(cancelled!.slots).toEqual([]);
    });
  });

  describe("who is on each shift", () => {
    it("shows members who else holds each shift, and not themselves", async () => {
      const s = await import("./signups");
      const { myShifts, openShiftsFor } = await import("./my-shifts");
      const id = await slot({ title: "Pairing", capacity: 6, startsAt: inDays(6, 9), endsAt: inDays(6, 11) });
      for (const k of ["ada", "ben", "cy"]) await s.claimSlot(viewer(k), id);
      const mine = (await myShifts(u.ada!)).upcoming.find((m) => m.slot.id === id)!;
      expect(mine.withNames).toEqual(["ben", "cy"]);
      const open = (await openShiftsFor({ id: u.dee!, role: "member" })).find((o) => o.slot.id === id)!;
      expect(open.names).toEqual(["ada", "ben", "cy"]);
      expect(open.filled).toBe(3);
    });

    it("shows a few names and counts the rest", async () => {
      const s = await import("./signups");
      const { openShiftsFor } = await import("./my-shifts");
      const id = await slot({ title: "Crowd", capacity: 10, startsAt: inDays(7, 9), endsAt: inDays(7, 11) });
      for (const k of ["ada", "ben", "cy", "dee", "eli"]) await s.claimSlot(viewer(k), id);
      const open = (await openShiftsFor({ id: u.fay!, role: "member" })).find((o) => o.slot.id === id)!;
      expect(open.names).toHaveLength(4);
      expect(open.filled).toBe(5);
    });

    it("keeps names from parents, who only see counts", async () => {
      const { openShiftsFor } = await import("./my-shifts");
      const open = await openShiftsFor({ id: u.mom!, role: "parent" });
      const crowd = open.find((o) => o.slot.title === "Crowd")!;
      expect(crowd.names).toEqual([]);
      expect(crowd.filled).toBe(5);
    });

    it("keeps names from parents on the shifts they hold too", async () => {
      const s = await import("./signups");
      const { myShifts } = await import("./my-shifts");
      const id = await slot({ title: "Family shift", capacity: 4, startsAt: inDays(9, 9), endsAt: inDays(9, 11) });
      await s.claimSlot(viewer("ada"), id);
      await s.claimSlot(viewer("mom", "parent"), id);
      const mine = (await myShifts(u.mom!, new Date(), "parent")).upcoming.find((m) => m.slot.id === id)!;
      expect(mine.withNames).toEqual([]);
      expect(mine.others).toBe(1);
    });

    it("leaves out people whose account was deactivated", async () => {
      const s = await import("./signups");
      const { openShiftsFor } = await import("./my-shifts");
      const { db } = await import("@/db");
      const { users } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const id = await slot({ title: "Ghost", capacity: 4, startsAt: inDays(8, 9), endsAt: inDays(8, 11) });
      await s.claimSlot(viewer("eli"), id);
      await db.update(users).set({ status: "deactivated" }).where(eq(users.id, u.eli!));
      const open = (await openShiftsFor({ id: u.fay!, role: "member" })).find((o) => o.slot.id === id)!;
      expect(open.names).not.toContain("eli");
      await db.update(users).set({ status: "active" }).where(eq(users.id, u.eli!));
    });
  });
});
