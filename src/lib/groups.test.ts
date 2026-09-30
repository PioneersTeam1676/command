import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("groups, group-only slots and priority windows", () => {
  let drop: () => Promise<void>;
  const u: Record<string, string> = {};
  let sheetId: string;
  let eventId: string;
  let scouts: string;
  let drivers: string;

  const inDays = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * 86_400_000);
    return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
  };
  const slotInput = (over: Partial<import("./signups").SlotFormInput> = {}) => ({ title: "Scouting", startsAt: inDays(5, 9), endsAt: inDays(5, 11), capacity: 5, audience: "anyone" as const, ...over });
  const viewer = (key: string, role: "member" | "lead" | "admin" | "parent" = "member") => ({ id: u[key]!, role });
  let hour = 0;
  /** Each slot gets its own hour so overlap rules never interfere with what a test is checking. */
  const nextHour = () => {
    hour += 1;
    return { startsAt: inDays(6, hour), endsAt: inDays(6, hour + 1) };
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
    await mk("scout", "member");
    await mk("outsider", "member");
    await mk("gone", "member", "deactivated");
    await mk("mom", "parent");
    await db.insert(parentLinks).values({ parentId: u.mom!, studentId: u.scout!, relationship: "Mother", fullName: "Mom", status: "approved" });
    const { seasonForDate } = await import("./seasons");
    const season = await seasonForDate(new Date().toISOString().slice(0, 10));
    const [e] = await db.insert(events).values({ seasonId: season.id, title: "Regional", startsAt: new Date(Date.now() + 4 * 86_400_000), endsAt: new Date(Date.now() + 8 * 86_400_000) }).returning();
    eventId = e!.id;
    const s = await import("./signups");
    const sheet = await s.createSheet(u.lead!, eventId);
    if (!sheet.ok) throw new Error("sheet");
    sheetId = sheet.id;
    const g = await import("./groups");
    const a = await g.createGroup(u.admin!, { name: "Super scouts" });
    const b = await g.createGroup(u.admin!, { name: "Drivers" });
    if (!a.ok || !b.ok) throw new Error("groups");
    scouts = a.id;
    drivers = b.id;
    await g.addGroupMembers(u.admin!, scouts, [u.scout!]);
  });
  afterAll(async () => {
    await drop?.();
  });

  it("names are unique regardless of case, and the create is audited", async () => {
    const g = await import("./groups");
    const dup = await g.createGroup(u.admin!, { name: "super SCOUTS" });
    expect(dup.ok).toBe(false);
    const { db } = await import("@/db");
    const { auditLog } = await import("@/db/schema");
    expect((await db.select().from(auditLog)).some((r) => r.action === "group.create" && r.targetId === scouts)).toBe(true);
  });

  it("adds people once, skips deactivated accounts, and removes them", async () => {
    const g = await import("./groups");
    const r1 = await g.addGroupMembers(u.admin!, drivers, [u.outsider!, u.outsider!, u.gone!]);
    expect(r1).toEqual({ ok: true, added: 1 });
    expect(await g.addGroupMembers(u.admin!, drivers, [u.outsider!])).toEqual({ ok: true, added: 0 });
    expect((await g.groupMembersOf(drivers)).map((m) => m.name)).toEqual(["outsider"]);
    await g.removeGroupMember(u.admin!, drivers, u.outsider!);
    expect(await g.groupMembersOf(drivers)).toHaveLength(0);
  });

  it("a group-only slot (no opening time) is taken by members only and hidden from everyone else", async () => {
    const s = await import("./signups");
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Scouts only", ...nextHour(), groupIds: [scouts] }));
    if (!slot.ok) throw new Error("slot");
    const no = await s.claimSlot(viewer("outsider"), slot.id);
    expect(no.ok).toBe(false);
    expect((await s.claimSlot(viewer("scout"), slot.id)).ok).toBe(true);
    const asOutsider = await s.getSignupView(eventId, viewer("outsider"));
    expect(asOutsider!.slots.some((v) => v.slot.title === "Scouts only")).toBe(false);
    const asScout = await s.getSignupView(eventId, viewer("scout"));
    expect(asScout!.slots.find((v) => v.slot.title === "Scouts only")!.groups.map((g) => g.name)).toEqual(["Super scouts"]);
    const asLead = await s.getSignupView(eventId, viewer("lead", "lead"));
    expect(asLead!.slots.some((v) => v.slot.title === "Scouts only")).toBe(true);
  });

  it("a priority window gives the group first pick, then opens to everyone", async () => {
    const s = await import("./signups");
    const { db } = await import("@/db");
    const { signupSlots } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const t = nextHour();
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Priority", ...t, groupIds: [scouts], opensToAllAt: inDays(3, 12) }));
    if (!slot.ok) throw new Error("slot");
    const [row] = await db.select().from(signupSlots).where(eq(signupSlots.id, slot.id));
    const opens = row!.opensToAllAt!;
    const before = new Date(opens.getTime() - 60_000);
    const after = new Date(opens.getTime() + 60_000);

    const early = await s.claimSlot(viewer("outsider"), slot.id, before);
    expect(early.ok).toBe(false);
    expect(!early.ok && early.error).toContain("first pick");
    // The outsider still SEES it, marked as early access, so they know when to come back.
    const seen = (await s.getSignupView(eventId, viewer("outsider"), before))!.slots.find((v) => v.slot.title === "Priority")!;
    expect(seen.gate.state).toBe("early_access");

    expect((await s.claimSlot(viewer("scout"), slot.id, before)).ok).toBe(true);
    expect((await s.claimSlot(viewer("outsider"), slot.id, after)).ok).toBe(true);
  });

  it("still applies the audience on top of the group", async () => {
    const s = await import("./signups");
    const g = await import("./groups");
    await g.addGroupMembers(u.admin!, scouts, [u.mom!]);
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Members in group", ...nextHour(), audience: "members", groupIds: [scouts] }));
    if (!slot.ok) throw new Error("slot");
    expect((await s.claimSlot(viewer("mom", "parent"), slot.id)).ok).toBe(false);
  });

  it("rejects an opening time without a group, or after the shift ends", async () => {
    const s = await import("./signups");
    const noGroup = await s.addSlot(u.lead!, sheetId, slotInput({ title: "x", ...nextHour(), opensToAllAt: inDays(3, 12) }));
    expect(noGroup.ok).toBe(false);
    expect(!noGroup.ok && noGroup.field).toBe("opensToAllAt");
    const late = await s.addSlot(u.lead!, sheetId, slotInput({ title: "y", startsAt: inDays(6, 20), endsAt: inDays(6, 21), groupIds: [scouts], opensToAllAt: inDays(6, 22) }));
    expect(late.ok).toBe(false);
    const ghost = await s.addSlot(u.lead!, sheetId, slotInput({ title: "z", ...nextHour(), groupIds: ["00000000-0000-4000-8000-000000000000"] }));
    expect(ghost.ok).toBe(false);
  });

  it("refuses to delete a group that still gates a shift, so shifts never open by accident", async () => {
    const s = await import("./signups");
    const g = await import("./groups");
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Drivers only", ...nextHour(), groupIds: [drivers] }));
    if (!slot.ok) throw new Error("slot");
    const blocked = await g.deleteGroup(u.admin!, drivers);
    expect(blocked.ok).toBe(false);
    expect(await g.getGroup(drivers)).toBeDefined();
    // Take the group off the shift (an edit), and the delete goes through.
    const t = nextHour();
    expect((await s.updateSlot(u.lead!, slot.id, slotInput({ title: "Drivers only", ...t }))).ok).toBe(true);
    expect((await g.deleteGroup(u.admin!, drivers)).ok).toBe(true);
    expect(await g.getGroup(drivers)).toBeUndefined();
  });

  it("the database itself refuses to drop a group that a shift still uses", async () => {
    const { db } = await import("@/db");
    const { groups } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await expect(db.delete(groups).where(eq(groups.id, scouts))).rejects.toThrow();
  });

  it("editing a slot replaces its groups and records the change", async () => {
    const s = await import("./signups");
    const g = await import("./groups");
    const other = await g.createGroup(u.admin!, { name: "Pit crew" });
    if (!other.ok) throw new Error("group");
    const slot = await s.addSlot(u.lead!, sheetId, slotInput({ title: "Swap", ...nextHour(), groupIds: [scouts] }));
    if (!slot.ok) throw new Error("slot");
    const t = nextHour();
    expect((await s.updateSlot(u.lead!, slot.id, slotInput({ title: "Swap", ...t, groupIds: [other.id] }))).ok).toBe(true);
    const view = (await s.getSignupView(eventId, viewer("lead", "lead")))!.slots.find((v) => v.slot.id === slot.id)!;
    expect(view.groups.map((x) => x.name)).toEqual(["Pit crew"]);
    const { db } = await import("@/db");
    const { auditLog } = await import("@/db/schema");
    const row = (await db.select().from(auditLog)).find((r) => r.action === "signup.slot_update" && r.targetId === slot.id)!;
    expect((row.before as { groupIds: string[] }).groupIds).toEqual([scouts]);
    expect((row.after as { groupIds: string[] }).groupIds).toEqual([other.id]);
  });

  it("erasing a person's data takes them out of every group", async () => {
    const g = await import("./groups");
    const users = await import("./users");
    const { db } = await import("@/db");
    const { users: usersTable } = await import("@/db/schema");
    const [v] = await db.insert(usersTable).values({ email: "leaver@x.com", name: "leaver", role: "member", status: "active" }).returning({ id: usersTable.id });
    await g.addGroupMembers(u.admin!, scouts, [v!.id]);
    expect((await g.groupIdsForUser(v!.id))).toContain(scouts);
    expect((await users.erasePersonalData(u.admin!, v!.id)).ok).toBe(true);
    expect(await g.groupIdsForUser(v!.id)).toEqual([]);
  });
});
