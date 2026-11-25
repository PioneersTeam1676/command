import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("tech lead", () => {
  let drop: () => Promise<void>;
  const u: Record<string, string> = {};

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, setupCompletedAt: new Date() });
    const mk = async (key: string, role: "member" | "lead" | "admin" | "parent") => {
      u[key] = (await db.insert(users).values({ email: `${key}@x.com`, name: key, role, status: "active" }).returning({ id: users.id }))[0]!.id;
    };
    await mk("admin", "admin");
    await mk("tl", "member");
    await mk("other", "lead");
    await mk("kid", "member");
  });
  afterAll(async () => {
    delete process.env.TECH_LEAD_EMAIL;
    (await import("@/lib/env")).resetEnvCache();
    await drop?.();
  });

  const setEnvEmail = async (email: string | undefined) => {
    if (email) process.env.TECH_LEAD_EMAIL = email;
    else delete process.env.TECH_LEAD_EMAIL;
    (await import("@/lib/env")).resetEnvCache();
  };

  it("does nothing without TECH_LEAD_EMAIL", async () => {
    const tl = await import("./tech-lead");
    await setEnvEmail(undefined);
    expect(await tl.claimTechLead()).toBeNull();
  });

  it("waits until the account is a lead or admin, then claims it (email is case-insensitive)", async () => {
    const tl = await import("./tech-lead");
    const users = await import("./users");
    await setEnvEmail("TL@X.com");
    expect(await tl.claimTechLead()).toBeNull(); // still a member
    expect((await users.changeRole(u.admin!, u.tl!, "lead")).ok).toBe(true); // promotion triggers the claim
    expect(await tl.getTechLeadId()).toBe(u.tl);
  });

  it("ignores later changes to the env var", async () => {
    const tl = await import("./tech-lead");
    await setEnvEmail("other@x.com");
    expect(await tl.claimTechLead()).toBe(u.tl);
    expect(await tl.getTechLeadId()).toBe(u.tl);
  });

  it("the database refuses to change, transfer or clear it", async () => {
    const { db } = await import("@/db");
    const { teamSettings } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await expect(db.update(teamSettings).set({ techLeadUserId: u.other! }).where(eq(teamSettings.id, 1))).rejects.toThrow();
    await expect(db.update(teamSettings).set({ techLeadUserId: null }).where(eq(teamSettings.id, 1))).rejects.toThrow();
    await expect(db.update(teamSettings).set({ techLeadClaimedAt: new Date() }).where(eq(teamSettings.id, 1))).rejects.toThrow();
    await expect(db.delete(teamSettings).where(eq(teamSettings.id, 1))).rejects.toThrow();
    // Unrelated settings still save.
    await db.update(teamSettings).set({ name: "Renamed team" }).where(eq(teamSettings.id, 1));
  });

  it("the tech lead's account can't be demoted, deactivated, erased or deleted", async () => {
    const users = await import("./users");
    expect((await users.changeRole(u.admin!, u.tl!, "member")).ok).toBe(false);
    expect((await users.changeRole(u.admin!, u.tl!, "admin")).ok).toBe(true);
    expect((await users.deactivateUser(u.admin!, u.tl!)).ok).toBe(false);
    expect((await users.erasePersonalData(u.admin!, u.tl!)).ok).toBe(false);
    expect((await users.deleteUser(u.admin!, u.tl!)).ok).toBe(false);
  });

  it("only the tech lead can rename, and it's audited", async () => {
    const tl = await import("./tech-lead");
    const { db } = await import("@/db");
    const { users, auditLog } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    expect((await tl.renameUser(u.admin!, u.kid!, "Nope")).ok).toBe(false);
    expect((await tl.renameUser(u.tl!, u.kid!, "   ")).ok).toBe(false);
    expect((await tl.renameUser(u.tl!, u.kid!, "  Kid Renamed ")).ok).toBe(true);
    const [kid] = await db.select({ name: users.name }).from(users).where(eq(users.id, u.kid!));
    expect(kid!.name).toBe("Kid Renamed");
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, "user.rename"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorId).toBe(u.tl);
    expect(rows[0]!.before).toEqual({ name: "kid" });
  });
});
