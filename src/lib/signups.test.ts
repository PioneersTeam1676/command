import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("sign-ups: sheets, slots, claiming", () => {
  let drop: () => Promise<void>;
  const u: Record<string, string> = {};
  let eventId: string;
  let sheetId: string;

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
    const { users, teamSettings, seasons, parentLinks, events } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "America/New_York", setupCompletedAt: new Date() });
    await db.insert(seasons).values({ name: "2026", startDate: "2026-01-01", isCurrent: true });
    const mk = async (key: string, role: "member" | "lead" | "admin" | "parent", status: "active" | "deactivated" = "active") => {
      u[key] = (await db.insert(users).values({ email: `${key}@x.com`, name: key, role, status }).returning({ id: users.id }))[0]!.id;
    };
    await mk("lead", "lead");
    await mk("m1", "member");
    await mk("m2", "member");
    await mk("m3", "member");
    await mk("gone", "member", "deactivated");
    await mk("mom", "parent");
    await mk("lonely", "parent");
    await db.insert(parentLinks).values({ parentId: u.mom!, studentId: u.m1!, relationship: "Mother", fullName: "Mom", status: "approved" });
    const { seasonForDate } = await import("./seasons");
    const season = await seasonForDate(new Date().toISOString().slice(0, 10));
    const [e] = await db.insert(events).values({ seasonId: season.id, title: "Regional", startsAt: new Date(Date.now() + 4 * 86_400_000), endsAt: new Date(Date.now() + 6 * 86_400_000) }).returning();
    eventId = e!.id;
  });
  afterAll(async () => {
    await drop?.();
  });

  it("creates a sheet once, even if asked twice, and audits it", async () => {
    const s = await import("./signups");
    const a = await s.createSheet(u.lead!, eventId);
    const b = await s.createSheet(u.lead!, eventId);
    expect(a.ok && b.ok && a.id === b.id).toBe(true);
    if (a.ok) sheetId = a.id;
    const { db } = await import("@/db");
    const { auditLog } = await import("@/db/schema");
    expect((await db.select().from(auditLog)).filter((r) => r.action === "signup.sheet_create")).toHaveLength(1);
  });

  it("validates slot times and capacity", async () => {
    const s = await import("./signups");
    expect((await s.addSlot(u.lead!, sheetId, slotInput({ startsAt: inDays(5, 11), endsAt: inDays(5, 9) }))).ok).toBe(false);
    expect((await s.addSlot(u.lead!, sheetId, slotInput({ startsAt: inDays(5, 9), endsAt: inDays(9, 9) }))).ok).toBe(false);
    expect(s.slotFormSchema.safeParse({ ...slotInput(), capacity: "0" }).success).toBe(false);
    expect(s.slotFormSchema.safeParse({ ...slotInput(), capacity: "2.5" }).success).toBe(false);
    expect(s.slotFormSchema.safeParse({ ...slotInput(), capacity: "501" }).success).toBe(false);
    expect(s.slotFormSchema.safeParse({ ...slotInput(), capacity: "3" }).success).toBe(true);
  });

  it("lets members claim up to capacity, then says it's full", async () => {
    const s = await import("./signups");
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Morning", capacity: 2, waitlistEnabled: false }));
    if (!slot.ok) throw new Error("slot");
    expect((await s.claimSlot(viewer("m1"), slot.id)).ok).toBe(true);
    expect((await s.claimSlot(viewer("m2"), slot.id)).ok).toBe(true);
    const third = await s.claimSlot(viewer("m3"), slot.id);
    expect(third).toEqual({ ok: false, error: "This shift is full." });
  });

  it("never gives the last place to two people racing for it", async () => {
    const s = await import("./signups");
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Race", startsAt: inDays(5, 14), endsAt: inDays(5, 15), capacity: 1, waitlistEnabled: false }));
    if (!slot.ok) throw new Error("slot");
    const results = await Promise.all([s.claimSlot(viewer("m1"), slot.id), s.claimSlot(viewer("m2"), slot.id), s.claimSlot(viewer("m3"), slot.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("rejects a second claim of the same shift by the same person, even double-tapped", async () => {
    const s = await import("./signups");
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Tap", startsAt: inDays(5, 16), endsAt: inDays(5, 17), capacity: 5 }));
    if (!slot.ok) throw new Error("slot");
    const results = await Promise.all([s.claimSlot(viewer("m3"), slot.id), s.claimSlot(viewer("m3"), slot.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("blocks overlapping shifts on the same sheet but allows back-to-back ones", async () => {
    const s = await import("./signups");
    const a = await s.addSlot(u.lead!, sheetId, slotInput({ title: "A", startsAt: inDays(6, 9), endsAt: inDays(6, 11), capacity: 3 }));
    const b = await s.addSlot(u.lead!, sheetId, slotInput({ title: "B overlaps", startsAt: inDays(6, 10), endsAt: inDays(6, 12), capacity: 3 }));
    const c = await s.addSlot(u.lead!, sheetId, slotInput({ title: "C after", startsAt: inDays(6, 11), endsAt: inDays(6, 13), capacity: 3 }));
    if (!a.ok || !b.ok || !c.ok) throw new Error("slots");
    expect((await s.claimSlot(viewer("m2"), a.id)).ok).toBe(true);
    const clash = await s.claimSlot(viewer("m2"), b.id);
    expect(clash.ok).toBe(false);
    expect(!clash.ok && clash.error).toContain("A");
    expect((await s.claimSlot(viewer("m2"), c.id)).ok).toBe(true);
  });

  it("enforces the audience: members-only and parents-only", async () => {
    const s = await import("./signups");
    const memOnly = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Members", startsAt: inDays(7, 9), endsAt: inDays(7, 10), audience: "members" }));
    const parOnly = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Parents", startsAt: inDays(7, 11), endsAt: inDays(7, 12), audience: "parents" }));
    if (!memOnly.ok || !parOnly.ok) throw new Error("slots");
    expect((await s.claimSlot(viewer("mom", "parent"), memOnly.id)).ok).toBe(false);
    expect((await s.claimSlot(viewer("m3"), parOnly.id)).ok).toBe(false);
    expect((await s.claimSlot(viewer("lead", "lead"), parOnly.id)).ok).toBe(false);
    expect((await s.claimSlot(viewer("m3"), memOnly.id)).ok).toBe(true);
    expect((await s.claimSlot(viewer("mom", "parent"), parOnly.id)).ok).toBe(true);
  });

  it("only lets a parent with an approved student link sign up", async () => {
    const s = await import("./signups");
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Snacks", startsAt: inDays(7, 14), endsAt: inDays(7, 15), audience: "parents" }));
    if (!slot.ok) throw new Error("slot");
    const r = await s.claimSlot(viewer("lonely", "parent"), slot.id);
    expect(r.ok).toBe(false);
  });

  it("refuses deactivated accounts, and trusts the database role not the caller's claimed role", async () => {
    const s = await import("./signups");
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Locked", startsAt: inDays(7, 16), endsAt: inDays(7, 17), audience: "members" }));
    if (!slot.ok) throw new Error("slot");
    expect((await s.claimSlot(viewer("gone"), slot.id)).ok).toBe(false);
    // A parent lying about being a member is still refused: the role is re-read inside the transaction.
    expect((await s.claimSlot({ id: u.mom!, role: "member" }, slot.id)).ok).toBe(false);
  });

  it("lets people leave until the shift starts, and frees the place", async () => {
    const s = await import("./signups");
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Leave", startsAt: inDays(8, 9), endsAt: inDays(8, 10), capacity: 1, waitlistEnabled: false }));
    if (!slot.ok) throw new Error("slot");
    await s.claimSlot(viewer("m1"), slot.id);
    expect((await s.claimSlot(viewer("m2"), slot.id)).ok).toBe(false);
    expect((await s.leaveSlot(viewer("m1"), slot.id)).ok).toBe(true);
    expect((await s.claimSlot(viewer("m2"), slot.id)).ok).toBe(true);
    // Once it has started, members can't just walk away from it.
    const later = new Date(Date.now() + 8 * 86_400_000 + 12 * 3_600_000);
    expect((await s.leaveSlot(viewer("m2"), slot.id, later)).ok).toBe(false);
  });

  it("refuses to lower capacity below the people already holding the shift", async () => {
    const s = await import("./signups");
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Shrink", startsAt: inDays(8, 12), endsAt: inDays(8, 13), capacity: 3 }));
    if (!slot.ok) throw new Error("slot");
    await s.claimSlot(viewer("m1"), slot.id);
    await s.claimSlot(viewer("m2"), slot.id);
    const r = await s.updateSlot(u.lead!, slot.id, slotInput({ title: "Shrink", startsAt: inDays(8, 12), endsAt: inDays(8, 13), capacity: 1 }));
    expect(r.ok).toBe(false);
    expect((await s.updateSlot(u.lead!, slot.id, slotInput({ title: "Shrink", startsAt: inDays(8, 12), endsAt: inDays(8, 13), capacity: 2 }))).ok).toBe(true);
  });

  it("stops claims when the sheet is closed, and reopens", async () => {
    const s = await import("./signups");
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Closable", startsAt: inDays(8, 15), endsAt: inDays(8, 16), capacity: 5 }));
    if (!slot.ok) throw new Error("slot");
    await s.setSheetClosed(u.lead!, sheetId, true);
    expect((await s.claimSlot(viewer("m3"), slot.id)).ok).toBe(false);
    await s.setSheetClosed(u.lead!, sheetId, false);
    expect((await s.claimSlot(viewer("m3"), slot.id)).ok).toBe(true);
  });

  it("cancelling a shift closes it and notifies the people who held it, once", async () => {
    const s = await import("./signups");
    const { db } = await import("@/db");
    const { inAppNotifications } = await import("@/db/schema");
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Doomed", startsAt: inDays(9, 9), endsAt: inDays(9, 10), capacity: 5 }));
    if (!slot.ok) throw new Error("slot");
    await s.claimSlot(viewer("m1"), slot.id);
    await s.cancelSlot(u.lead!, slot.id);
    await s.cancelSlot(u.lead!, slot.id);
    expect((await s.claimSlot(viewer("m2"), slot.id)).ok).toBe(false);
    const inbox = (await db.select().from(inAppNotifications)).filter((n) => n.type === "signup_change" && n.title.includes("Doomed"));
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.userId).toBe(u.m1);
  });

  it("shows names to members but only counts to parents, and hides cancelled and off-audience slots", async () => {
    const s = await import("./signups");
    const asMember = await s.getSignupView(eventId, viewer("m1"));
    const asParent = await s.getSignupView(eventId, viewer("mom", "parent"));
    const asLead = await s.getSignupView(eventId, viewer("lead", "lead"));
    expect(asMember!.slots.find((v) => v.slot.title === "Morning")!.roster!.map((r) => r.name).sort()).toEqual(["m1", "m2"]);
    expect(asParent!.slots.find((v) => v.slot.title === "Morning")!.roster).toBeNull();
    expect(asParent!.slots.find((v) => v.slot.title === "Morning")!.filled).toBe(2);
    expect(asMember!.slots.some((v) => v.slot.title === "Doomed")).toBe(false);
    expect(asLead!.slots.some((v) => v.slot.title === "Doomed")).toBe(true);
    expect(asMember!.slots.some((v) => v.slot.audience === "parents")).toBe(false);
    expect(asParent!.slots.some((v) => v.slot.audience === "members")).toBe(false);
  });

  it("removes entries when the event is deleted", async () => {
    const s = await import("./signups");
    const { db } = await import("@/db");
    const { events, signupEntries } = await import("@/db/schema");
    const { seasonForDate } = await import("./seasons");
    const season = await seasonForDate(new Date().toISOString().slice(0, 10));
    const [e] = await db.insert(events).values({ seasonId: season.id, title: "Temp", startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 2 * 86_400_000) }).returning();
    const sh = await s.createSheet(u.lead!, e!.id);
    if (!sh.ok) throw new Error("sheet");
    const slot = await s.addSlot(u.lead!, sh.id, slotInput({ title: "Temp shift", startsAt: inDays(1, 20), endsAt: inDays(1, 21) }));
    if (!slot.ok) throw new Error("slot");
    await s.claimSlot(viewer("m3"), slot.id);
    await db.delete(events).where((await import("drizzle-orm")).eq(events.id, e!.id));
    expect((await db.select().from(signupEntries)).some((x) => x.slotId === slot.id)).toBe(false);
  });
});
