import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

/** Spec 15 / phase 5: every privileged action lands in the audit log. Each case runs the real function. */
describe.skipIf(!hasTestDb)("audit log coverage", () => {
  let drop: () => Promise<void>;
  const u: Record<string, string> = {};
  let seasonId: string;

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings, seasons } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, timezone: "America/New_York", setupCompletedAt: new Date() });
    const [s] = await db.insert(seasons).values({ name: "2026", startDate: "2026-01-01", isCurrent: true, buildStart: "2026-01-03", buildEnd: "2026-02-18" }).returning();
    seasonId = s!.id;
    const mk = async (key: string, role: "member" | "lead" | "admin" | "parent") => {
      u[key] = (await db.insert(users).values({ email: `${key}@x.com`, name: key, role, status: "active", createdAt: new Date("2025-12-01T00:00:00Z") }).returning({ id: users.id }))[0]!.id;
    };
    await mk("admin", "admin");
    await mk("admin2", "admin");
    await mk("lead", "lead");
    await mk("kid", "member");
    await mk("kid2", "member");
    await mk("parent", "parent");
  });
  afterAll(async () => {
    await drop?.();
  });

  async function actions(): Promise<string[]> {
    const { db } = await import("@/db");
    const { auditLog } = await import("@/db/schema");
    return (await db.select().from(auditLog)).map((a) => a.action);
  }
  async function expectAudit(name: string, run: () => Promise<unknown>) {
    const before = (await actions()).filter((a) => a === name).length;
    await run();
    const after = (await actions()).filter((a) => a === name).length;
    expect(after, `expected an audit row for ${name}`).toBe(before + 1);
  }

  it("user management", async () => {
    const users = await import("./users");
    await expectAudit("user.change_role", () => users.changeRole(u.admin!, u.kid!, "lead"));
    await expectAudit("user.deactivate", () => users.deactivateUser(u.admin!, u.kid2!));
    await expectAudit("user.reactivate", () => users.reactivateUser(u.admin!, u.kid2!));
    await expectAudit("user.password_reset_temporary", async () => (await import("./accounts")).adminResetPassword(u.admin!, u.kid!));
    await expectAudit("user.erase_personal_data", () => users.erasePersonalData(u.admin!, u.kid2!));
    await expectAudit("user.delete", () => users.deleteUser(u.admin!, u.kid2!));
  });

  it("approvals", async () => {
    const acc = await import("./accounts");
    const { db } = await import("@/db");
    const { users, accessRequests } = await import("@/db/schema");
    const mkPending = async (email: string) => {
      const [p] = await db.insert(users).values({ email, name: email, status: "pending" }).returning();
      const [r] = await db.insert(accessRequests).values({ userId: p!.id }).returning();
      return r!.id;
    };
    const a = await mkPending("a@x.com");
    const d = await mkPending("d@x.com");
    await expectAudit("access_request.approve", () => acc.approveAccessRequest(u.admin!, a));
    await expectAudit("access_request.deny", () => acc.denyAccessRequest(u.admin!, d, "no"));
  });

  it("parent links", async () => {
    const parents = await import("./parents");
    const { db } = await import("@/db");
    const { parentLinks } = await import("@/db/schema");
    const rows = await db
      .insert(parentLinks)
      .values([
        { parentId: u.parent!, studentId: u.kid!, relationship: "Mother", fullName: "P" },
      ])
      .returning();
    await expectAudit("parent_link.approved", () => parents.decideParentLink(u.admin!, rows[0]!.id, "approved"));
    await expectAudit("parent_link.revoke", () => parents.revokeParentLink(u.admin!, rows[0]!.id));
  });

  it("events, seasons and settings", async () => {
    const ev = await import("./events");
    const created = await ev.createEvent(u.lead!, { title: "E", startsAt: "2026-07-10T18:00", endsAt: "2026-07-10T20:00", verification: "inherit" });
    if (!created.ok) throw new Error("create failed");
    await expectAudit("event.update", () => ev.updateEvent(u.lead!, created.id, { title: "E2", startsAt: "2026-07-10T18:00", endsAt: "2026-07-10T20:00", verification: "none" }));
    await expectAudit("event.cancel", () => ev.cancelEvent(u.lead!, created.id));
    const { updateCurrentSeason } = await import("./seasons");
    await expectAudit("season.update", () => updateCurrentSeason(u.admin!, { name: "2026 renamed", buildStart: "2026-01-03", buildEnd: "2026-02-18", workdays: [1, 2, 3] }));
    const { updateTeamSettings } = await import("./settings-admin");
    await expectAudit("settings.team", () => updateTeamSettings(u.admin!, { name: "New Name" }, "settings.team"));
    await expectAudit("settings.attendance", () => updateTeamSettings(u.admin!, { offHoursRequiresApproval: false }, "settings.attendance"));
    // No-op saves don't create noise.
    const before = (await actions()).length;
    await updateTeamSettings(u.admin!, { name: "New Name" }, "settings.team");
    expect((await actions()).length).toBe(before);
  });

  it("attendance edits", async () => {
    const a = await import("./attendance");
    const added = await a.addSessionForUser(u.lead!, { userId: u.kid!, kind: "open", inAt: new Date("2026-01-06T20:00:00Z"), outAt: new Date("2026-01-06T22:00:00Z") }, new Date("2026-02-01T00:00:00Z"));
    if (!added.ok) throw new Error(added.error);
    await expectAudit("attendance.edit", () => a.editSessionTimes(u.lead!, added.session.id, { outAt: new Date("2026-01-06T23:00:00Z") }, new Date("2026-02-01T00:00:00Z")));
    await expectAudit("attendance.reject", () => a.rejectSession(u.lead!, added.session.id, "x"));
    const other = await a.addSessionForUser(u.lead!, { userId: u.kid!, kind: "open", inAt: new Date("2026-01-07T20:00:00Z"), outAt: new Date("2026-01-07T22:00:00Z") }, new Date("2026-02-01T00:00:00Z"));
    if (!other.ok) throw new Error(other.error);
    expect(seasonId).toBeTruthy();
    // Resolving an overlap is audited. Permanent delete deliberately is not.
    const overlapping = await a.addSessionForUser(u.lead!, { userId: u.kid!, kind: "open", inAt: new Date("2026-01-07T21:00:00Z"), outAt: new Date("2026-01-07T23:00:00Z") }, new Date("2026-02-01T00:00:00Z"));
    if (!overlapping.ok) throw new Error(overlapping.error);
    await expectAudit("attendance.resolve_overlap", async () => {
      expect((await a.resolveOverlap(u.lead!, { aId: other.session.id, bId: overlapping.session.id, action: "merge" })).ok).toBe(true);
    });
    const countBefore = (await actions()).length;
    expect((await a.deleteSessionForever(other.session.id)).ok).toBe(true);
    expect((await actions()).length).toBeLessThanOrEqual(countBefore);
  });

  it("scrubs credential-like fields from audit payloads", async () => {
    const { audit } = await import("./audit");
    const { db } = await import("@/db");
    const { auditLog } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await audit({ actorId: u.admin!, action: "test.scrub", after: { password: "hunter2", passwordHash: "x", token: "t", nested: { apiKey: "k" }, ok: "fine" } });
    const [row] = await db.select().from(auditLog).where(eq(auditLog.action, "test.scrub"));
    expect(JSON.stringify(row!.after)).not.toContain("hunter2");
    expect(row!.after).toMatchObject({ password: "[redacted]", passwordHash: "[redacted]", token: "[redacted]", nested: { apiKey: "[redacted]" }, ok: "fine" });
  });
});
