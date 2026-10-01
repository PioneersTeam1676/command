import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("items, notes, bulk shifts, copy, and attendance next to shifts", () => {
  let drop: () => Promise<void>;
  const u: Record<string, string> = {};
  let eventId: string;
  let sheetId: string;

  const day = (d: number, h: number) => {
    const t = new Date(Date.now() + d * 86_400_000);
    return `${t.toISOString().slice(0, 10)}T${String(h).padStart(2, "0")}:00`;
  };
  const viewer = (k: string, role: "member" | "lead" | "admin" = "member") => ({ id: u[k]!, role });

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "UTC", setupCompletedAt: new Date() });
    await db.insert(seasons).values({ name: "2026", startDate: "2026-01-01", isCurrent: true });
    for (const [k, role] of [["lead", "lead"], ["ann", "member"], ["bob", "member"]] as const) {
      u[k] = (await db.insert(users).values({ email: `${k}@x.com`, name: k, role, status: "active" }).returning({ id: users.id }))[0]!.id;
    }
    const { createEvent } = await import("./events");
    const r = await createEvent(u.lead!, { title: "Bake sale", startsAt: day(5, 9), endsAt: day(5, 17), verification: "none" });
    if (!r.ok) throw new Error(r.error);
    eventId = r.id;
    const { createSheet } = await import("./signups");
    const s = await createSheet(u.lead!, eventId);
    if (!s.ok) throw new Error(s.error);
    sheetId = s.id;
  });
  afterAll(async () => {
    await drop?.();
  });

  it("an item needs no times, takes the event's, and keeps people's notes for leads only", async () => {
    const { addSlot, claimSlot, getSignupView } = await import("./signups");
    const r = await addSlot(u.lead!, sheetId, { kind: "item", title: "Drinks", startsAt: "", endsAt: "", capacity: 2, audience: "anyone" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await claimSlot(viewer("ann"), r.id, new Date(), "  sodas   and water ")).ok).toBe(true);
    expect((await claimSlot(viewer("bob"), r.id)).ok).toBe(true);
    expect((await claimSlot(viewer("lead", "lead"), r.id)).ok).toBe(true);
    const asLead = (await getSignupView(eventId, viewer("lead", "lead")))!.slots.find((s) => s.slot.id === r.id)!;
    expect(asLead.roster!.find((p) => p.name === "ann")!.note).toBe("sodas and water");
    expect(asLead.filled).toBe(2); // third one waitlisted
    const asMember = (await getSignupView(eventId, viewer("bob")))!.slots.find((s) => s.slot.id === r.id)!;
    expect(asMember.roster!.every((p) => p.note === undefined)).toBe(true);
    // A shift still needs its times.
    expect((await addSlot(u.lead!, sheetId, { title: "Greeter", startsAt: "", endsAt: "", capacity: 1, audience: "anyone" })).ok).toBe(false);
  });

  it("being at the event, or bringing something, never clashes with a shift", async () => {
    const { addSlot, claimSlot } = await import("./signups");
    const { setAttending } = await import("./attend");
    expect((await setAttending(viewer("ann"), eventId, true)).ok).toBe(true);
    const shift = await addSlot(u.lead!, sheetId, { title: "Cashier", startsAt: day(5, 10), endsAt: day(5, 12), capacity: 2, audience: "anyone" });
    const other = await addSlot(u.lead!, sheetId, { title: "Greeter", startsAt: day(5, 11), endsAt: day(5, 13), capacity: 2, audience: "anyone" });
    if (!shift.ok || !other.ok) throw new Error("slots");
    expect((await claimSlot(viewer("ann"), shift.id)).ok).toBe(true);
    expect((await claimSlot(viewer("ann"), other.id)).ok).toBe(false); // two overlapping shifts still clash
  });

  it("people can give back what they're bringing until the event is over, but not a shift that has started", async () => {
    const { addSlot, claimSlot, leaveSlot } = await import("./signups");
    const item = await addSlot(u.lead!, sheetId, { kind: "item", title: "Napkins", startsAt: "", endsAt: "", capacity: 1, audience: "anyone" });
    const shift = await addSlot(u.lead!, sheetId, { title: "Closer", startsAt: day(5, 15), endsAt: day(5, 17), capacity: 1, audience: "anyone" });
    if (!item.ok || !shift.ok) throw new Error("slots");
    await claimSlot(viewer("bob"), item.id);
    await claimSlot(viewer("bob"), shift.id);
    const midEvent = new Date(`${day(5, 16)}:00Z`);
    expect((await leaveSlot(viewer("bob"), item.id, midEvent)).ok).toBe(true); // event still running
    expect((await leaveSlot(viewer("bob"), shift.id, midEvent)).ok).toBe(false); // shift started
  });

  it("bulk-adds back-to-back shifts and refuses silly windows", async () => {
    const { addSlotsBulk } = await import("./signup-tools");
    const { db } = await import("@/db");
    const { signupSlots } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const r = await addSlotsBulk(u.lead!, sheetId, { title: "Booth", startsAt: day(6, 9), endsAt: day(6, 17), minutes: 120, capacity: 2, audience: "anyone" });
    expect(r).toEqual({ ok: true, count: 4 });
    const made = await db.select().from(signupSlots).where(and(eq(signupSlots.sheetId, sheetId), eq(signupSlots.title, "Booth")));
    expect(made).toHaveLength(4);
    expect(made.map((s) => s.startsAt.toISOString().slice(11, 16)).sort()).toEqual(["09:00", "11:00", "13:00", "15:00"]);
    expect((await addSlotsBulk(u.lead!, sheetId, { title: "Tiny", startsAt: day(6, 9), endsAt: day(6, 10), minutes: 120, capacity: 1, audience: "anyone" })).ok).toBe(false);
    expect((await addSlotsBulk(u.lead!, sheetId, { title: "Huge", startsAt: day(6, 0), endsAt: day(9, 0), minutes: 30, capacity: 1, audience: "anyone" })).ok).toBe(false);
  });

  it("copies shifts and items to another event, shifted to its date, without any names", async () => {
    const { createEvent } = await import("./events");
    const { copySheet, copySources } = await import("./signup-tools");
    const { getSignupView } = await import("./signups");
    const next = await createEvent(u.lead!, { title: "Bake sale 2", startsAt: day(12, 9), endsAt: day(12, 17), verification: "none" });
    if (!next.ok) throw new Error(next.error);
    expect((await copySources(next.id)).map((e) => e.id)).toContain(eventId);
    const r = await copySheet(u.lead!, eventId, next.id);
    expect(r.ok).toBe(true);
    const view = (await getSignupView(next.id, viewer("lead", "lead")))!;
    const cashier = view.slots.find((s) => s.slot.title === "Cashier")!;
    expect(cashier.slot.startsAt.toISOString().slice(0, 16)).toBe(`${day(12, 10)}`);
    expect(view.slots.find((s) => s.slot.title === "Drinks")!.slot.startsAt.toISOString().slice(0, 16)).toBe(day(12, 9));
    expect(view.slots.every((s) => s.filled === 0)).toBe(true);
    expect(view.slots.some((s) => s.slot.kind === "attend")).toBe(true); // the event's own "I'm going" spot isn't copied over
    expect(view.slots.filter((s) => s.slot.kind === "attend")).toHaveLength(1);
    expect((await copySheet(u.lead!, eventId, eventId)).ok).toBe(false);
  });
});
