import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("sign-up waitlist", () => {
  let drop: () => Promise<void>;
  const u: Record<string, string> = {};
  let sheetId: string;
  let eventId: string;

  const inDays = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * 86_400_000);
    return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
  };
  let hour = 0;
  /** Every slot gets its own hour so overlap rules never interfere unless a test wants them to. */
  const slotInput = (over: Partial<import("./signups").SlotFormInput> = {}) => {
    hour += 1;
    return { title: `Slot ${hour}`, startsAt: inDays(6, hour), endsAt: inDays(6, hour + 1), capacity: 1, audience: "anyone" as const, ...over };
  };
  const viewer = (key: string, role: "member" | "lead" | "admin" | "parent" = "member") => ({ id: u[key]!, role });
  const mkSlot = async (over: Partial<import("./signups").SlotFormInput> = {}) => {
    const s = await import("./signups");
    const r = await s.addSlot(u.lead!, sheetId, slotInput(over));
    if (!r.ok) throw new Error(r.error);
    return r.id;
  };
  const entryFor = async (slotId: string, key: string) => {
    const { db } = await import("@/db");
    const { signupEntries } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");
    return (await db.select().from(signupEntries).where(and(eq(signupEntries.slotId, slotId), eq(signupEntries.userId, u[key]!))))[0];
  };
  const confirmedCount = async (slotId: string) => {
    const { db } = await import("@/db");
    const { signupEntries } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");
    return (await db.select().from(signupEntries).where(and(eq(signupEntries.slotId, slotId), eq(signupEntries.status, "confirmed")))).length;
  };
  /** Notifications for one person about one shift, so promotions in earlier tests never leak in. */
  const inbox = async (key: string, title: string) => {
    const { db } = await import("@/db");
    const { inAppNotifications } = await import("@/db/schema");
    return (await db.select().from(inAppNotifications)).filter((n) => n.userId === u[key] && n.title.includes(title));
  };

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons, events } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "America/New_York", setupCompletedAt: new Date() });
    await db.insert(seasons).values({ name: "2026", startDate: "2026-01-01", isCurrent: true });
    for (const key of ["a", "b", "c", "d", "e"]) u[key] = (await db.insert(users).values({ email: `${key}@x.com`, name: key, role: "member", status: "active" }).returning({ id: users.id }))[0]!.id;
    u.lead = (await db.insert(users).values({ email: "lead@x.com", name: "lead", role: "lead", status: "active" }).returning({ id: users.id }))[0]!.id;
    const { seasonForDate } = await import("./seasons");
    const season = await seasonForDate(new Date().toISOString().slice(0, 10));
    const [e] = await db.insert(events).values({ seasonId: season.id, title: "Regional", startsAt: new Date(Date.now() + 4 * 86_400_000), endsAt: new Date(Date.now() + 8 * 86_400_000) }).returning();
    eventId = e!.id;
    const s = await import("./signups");
    const sheet = await s.createSheet(u.lead!, eventId);
    if (!sheet.ok) throw new Error("sheet");
    sheetId = sheet.id;
  });
  afterAll(async () => {
    await drop?.();
  });

  it("queues people once the shift is full and tells them their place", async () => {
    const s = await import("./signups");
    const slot = await mkSlot({ capacity: 1 });
    expect(await s.claimSlot(viewer("a"), slot)).toEqual({ ok: true, status: "confirmed" });
    expect(await s.claimSlot(viewer("b"), slot)).toEqual({ ok: true, status: "waitlisted", position: 1 });
    expect(await s.claimSlot(viewer("c"), slot)).toEqual({ ok: true, status: "waitlisted", position: 2 });
    expect((await s.claimSlot(viewer("c"), slot)).ok).toBe(false); // can't queue twice
    const view = (await s.getSignupView(eventId, viewer("c")))!.slots.find((v) => v.slot.id === slot)!;
    expect(view.filled).toBe(1);
    expect(view.waitlisted).toBe(2);
    expect(view.myPosition).toBe(2);
    expect(view.queue).toBeNull(); // only leads see who is queued
    const asLead = (await s.getSignupView(eventId, viewer("lead", "lead")))!.slots.find((v) => v.slot.id === slot)!;
    expect(asLead.queue!.map((q) => q.name)).toEqual(["b", "c"]);
  });

  it("says 'full' when the waitlist is off", async () => {
    const s = await import("./signups");
    const slot = await mkSlot({ capacity: 1, waitlistEnabled: false });
    await s.claimSlot(viewer("a"), slot);
    expect(await s.claimSlot(viewer("b"), slot)).toEqual({ ok: false, error: "This shift is full." });
  });

  it("promotes the oldest person when a place frees up, and notifies them exactly once", async () => {
    const s = await import("./signups");
    const slot = await mkSlot({ capacity: 1, title: "Promote me" });
    await s.claimSlot(viewer("a"), slot);
    await s.claimSlot(viewer("b"), slot);
    await s.claimSlot(viewer("c"), slot);
    expect((await s.leaveSlot(viewer("a"), slot)).ok).toBe(true);
    expect((await entryFor(slot, "b"))!.status).toBe("confirmed");
    expect((await entryFor(slot, "b"))!.promotedAt).not.toBeNull();
    expect((await entryFor(slot, "c"))!.status).toBe("waitlisted");
    expect(await inbox("b", "You're in: Promote me")).toHaveLength(1);
    expect(await inbox("c", "You're in: Promote me")).toHaveLength(0);
    // c's place in line moved up.
    expect((await s.getSignupView(eventId, viewer("c")))!.slots.find((v) => v.slot.id === slot)!.myPosition).toBe(1);
  });

  it("leaving the waitlist changes nobody else's status", async () => {
    const s = await import("./signups");
    const slot = await mkSlot({ capacity: 1 });
    await s.claimSlot(viewer("a"), slot);
    await s.claimSlot(viewer("b"), slot);
    await s.claimSlot(viewer("c"), slot);
    expect((await s.leaveSlot(viewer("b"), slot)).ok).toBe(true);
    expect((await entryFor(slot, "a"))!.status).toBe("confirmed");
    expect((await entryFor(slot, "c"))!.status).toBe("waitlisted");
    expect(await confirmedCount(slot)).toBe(1);
  });

  it("two people leaving at once promote exactly two, never over capacity", async () => {
    const s = await import("./signups");
    const slot = await mkSlot({ capacity: 2 });
    await s.claimSlot(viewer("a"), slot);
    await s.claimSlot(viewer("b"), slot);
    await s.claimSlot(viewer("c"), slot);
    await s.claimSlot(viewer("d"), slot);
    await s.claimSlot(viewer("e"), slot);
    await Promise.all([s.leaveSlot(viewer("a"), slot), s.leaveSlot(viewer("b"), slot)]);
    expect(await confirmedCount(slot)).toBe(2);
    expect((await entryFor(slot, "c"))!.status).toBe("confirmed");
    expect((await entryFor(slot, "d"))!.status).toBe("confirmed");
    expect((await entryFor(slot, "e"))!.status).toBe("waitlisted");
  });

  it("a claim racing a leave can't push the shift over capacity", async () => {
    const s = await import("./signups");
    const slot = await mkSlot({ capacity: 1 });
    await s.claimSlot(viewer("a"), slot);
    await s.claimSlot(viewer("b"), slot);
    await Promise.all([s.leaveSlot(viewer("a"), slot), s.claimSlot(viewer("c"), slot)]);
    expect(await confirmedCount(slot)).toBe(1);
  });

  it("raising the capacity pulls people off the waitlist", async () => {
    const s = await import("./signups");
    const t = slotInput({ title: "Grow", capacity: 1 });
    const added = await s.addSlot(u.lead!, sheetId, t);
    if (!added.ok) throw new Error("slot");
    await s.claimSlot(viewer("a"), added.id);
    await s.claimSlot(viewer("b"), added.id);
    await s.claimSlot(viewer("c"), added.id);
    expect((await s.updateSlot(u.lead!, added.id, { ...t, capacity: 2 })).ok).toBe(true);
    expect((await entryFor(added.id, "b"))!.status).toBe("confirmed");
    expect((await entryFor(added.id, "c"))!.status).toBe("waitlisted");
    expect(await inbox("b", "You're in: Grow")).toHaveLength(1);
  });

  it("skips a queued person who has been deactivated, and moves on to the next", async () => {
    const s = await import("./signups");
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const slot = await mkSlot({ capacity: 1 });
    await s.claimSlot(viewer("a"), slot);
    await s.claimSlot(viewer("b"), slot);
    await s.claimSlot(viewer("c"), slot);
    await db.update(users).set({ status: "deactivated" }).where(eq(users.id, u.b!));
    await s.leaveSlot(viewer("a"), slot);
    expect((await entryFor(slot, "b"))!.status).toBe("waitlisted");
    expect((await entryFor(slot, "c"))!.status).toBe("confirmed");
    await db.update(users).set({ status: "active" }).where(eq(users.id, u.b!));
  });

  it("skips a queued person whose place would now clash with a shift they hold", async () => {
    const s = await import("./signups");
    const first = slotInput({ title: "First", capacity: 1 });
    const second = slotInput({ title: "Second", capacity: 1 });
    const a = await s.addSlot(u.lead!, sheetId, first);
    const b = await s.addSlot(u.lead!, sheetId, second);
    if (!a.ok || !b.ok) throw new Error("slots");
    await s.claimSlot(viewer("a"), a.id);
    await s.claimSlot(viewer("b"), a.id); // b waits on "First"
    await s.claimSlot(viewer("c"), a.id); // c waits behind b
    await s.claimSlot(viewer("b"), b.id); // b takes "Second", which doesn't overlap yet
    // A lead moves "Second" on top of "First": b's promotion would now double-book them.
    expect((await s.updateSlot(u.lead!, b.id, { ...second, startsAt: first.startsAt, endsAt: first.endsAt })).ok).toBe(true);
    await s.leaveSlot(viewer("a"), a.id);
    expect((await entryFor(a.id, "b"))!.status).toBe("waitlisted");
    expect((await entryFor(a.id, "c"))!.status).toBe("confirmed");
  });

  it("turning the waitlist off keeps whoever is already queued, but nobody new can join", async () => {
    const s = await import("./signups");
    const t = slotInput({ title: "Stop queue", capacity: 1 });
    const added = await s.addSlot(u.lead!, sheetId, t);
    if (!added.ok) throw new Error("slot");
    await s.claimSlot(viewer("a"), added.id);
    await s.claimSlot(viewer("b"), added.id);
    await s.updateSlot(u.lead!, added.id, { ...t, waitlistEnabled: false });
    expect((await s.claimSlot(viewer("c"), added.id)).ok).toBe(false);
    await s.leaveSlot(viewer("a"), added.id);
    expect((await entryFor(added.id, "b"))!.status).toBe("confirmed");
  });

  it("a cancelled shift stops blocking people from overlapping ones", async () => {
    const s = await import("./signups");
    const t1 = slotInput({ title: "Will cancel", capacity: 3 });
    const t2 = slotInput({ title: "Overlaps it", capacity: 3, startsAt: t1.startsAt, endsAt: t1.endsAt });
    const a = await s.addSlot(u.lead!, sheetId, t1);
    const b = await s.addSlot(u.lead!, sheetId, t2);
    if (!a.ok || !b.ok) throw new Error("slots");
    await s.claimSlot(viewer("d"), a.id);
    expect((await s.claimSlot(viewer("d"), b.id)).ok).toBe(false);
    await s.cancelSlot(u.lead!, a.id);
    expect((await s.claimSlot(viewer("d"), b.id)).ok).toBe(true);
  });

  it("cancelling a shift tells the waitlist too, and never promotes anyone into it", async () => {
    const s = await import("./signups");
    const slot = await mkSlot({ capacity: 1, title: "Doomed queue" });
    await s.claimSlot(viewer("a"), slot);
    await s.claimSlot(viewer("e"), slot);
    await s.cancelSlot(u.lead!, slot);
    expect(await inbox("e", "Shift cancelled: Doomed queue")).toHaveLength(1);
    expect((await entryFor(slot, "e"))!.status).toBe("waitlisted");
  });
});
