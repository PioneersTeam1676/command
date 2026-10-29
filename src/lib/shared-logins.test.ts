import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("shared logins", () => {
  let drop: () => Promise<void>;
  const u: Record<string, string> = {};
  let scouts: string;
  let drivers: string;
  let loginId: string;
  const viewer = (key: string, role: "member" | "lead" | "admin" | "parent" = "member") => ({ id: u[key]!, role });
  // RFC 6238 test secret, base32 of "12345678901234567890"
  const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    process.env.SHARED_LOGIN_KEY = "k".repeat(40);
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, groups, groupMembers } = await import("@/db/schema");
    const mk = async (key: string, role: "member" | "lead" | "admin" | "parent", status: "active" | "deactivated" = "active") => {
      u[key] = (await db.insert(users).values({ email: `${key}@x.com`, name: key, role, status }).returning({ id: users.id }))[0]!.id;
    };
    await mk("admin", "admin");
    await mk("lead", "lead");
    await mk("scout", "member");
    await mk("driver", "member");
    await mk("outsider", "member");
    await mk("gone", "member", "deactivated");
    await mk("mom", "parent");
    scouts = (await db.insert(groups).values({ name: "Scouts" }).returning({ id: groups.id }))[0]!.id;
    drivers = (await db.insert(groups).values({ name: "Drivers" }).returning({ id: groups.id }))[0]!.id;
    await db.insert(groupMembers).values([
      { groupId: scouts, userId: u.scout! },
      { groupId: scouts, userId: u.gone! },
      { groupId: scouts, userId: u.mom! },
      { groupId: drivers, userId: u.driver! },
    ]);
  });
  afterAll(async () => {
    await drop?.();
  });

  it("creates a login, stores nothing readable, and audits without secrets", async () => {
    const { createLogin } = await import("./shared-logins");
    const { db } = await import("@/db");
    const { sharedLogins, auditLog } = await import("@/db/schema");
    const r = await createLogin(u.admin!, { label: "Team Gmail", email: "team@example.com", password: "hunter2-pw", totpSecret: SECRET, groupIds: [scouts] });
    expect(r.ok).toBe(true);
    loginId = (r as { id: string }).id;
    const [row] = await db.select().from(sharedLogins);
    expect(JSON.stringify(row)).not.toContain("hunter2-pw");
    expect(JSON.stringify(row)).not.toContain(SECRET);
    const logs = JSON.stringify(await db.select().from(auditLog));
    expect(logs).toContain("shared_login.create");
    expect(logs).not.toContain("hunter2-pw");
    expect(logs).not.toContain(SECRET);
  });

  it("rejects a bad secret, no groups, and accepts an otpauth link", async () => {
    const { createLogin } = await import("./shared-logins");
    const base = { label: "X", email: "x@y.com", password: "p", groupIds: [scouts] };
    expect((await createLogin(u.admin!, { ...base, totpSecret: "not base32!" })).ok).toBe(false);
    expect((await createLogin(u.admin!, { ...base, totpSecret: "GEZD" })).ok).toBe(false); // too short to be a real secret
    expect((await createLogin(u.admin!, { ...base, groupIds: ["00000000-0000-4000-8000-000000000000"], totpSecret: SECRET })).ok).toBe(false);
    const link = `otpauth://totp/Team:me?secret=${SECRET}&issuer=Team`;
    const ok = await createLogin(u.admin!, { ...base, label: "Via link", totpSecret: link });
    expect(ok.ok).toBe(true);
    const { deleteLogin } = await import("./shared-logins");
    await deleteLogin(u.admin!, (ok as { id: string }).id);
  });

  it("only group members and admins can see it", async () => {
    const { canSeeLogin, listLoginsFor } = await import("./shared-logins");
    expect(await canSeeLogin(viewer("scout"), loginId)).toBe(true);
    expect(await canSeeLogin(viewer("admin", "admin"), loginId)).toBe(true);
    expect(await canSeeLogin(viewer("driver"), loginId)).toBe(false); // other group
    expect(await canSeeLogin(viewer("outsider"), loginId)).toBe(false);
    expect(await canSeeLogin(viewer("lead", "lead"), loginId)).toBe(false); // leads get no automatic access
    expect(await canSeeLogin(viewer("gone"), loginId)).toBe(false); // deactivated
    expect(await canSeeLogin(viewer("mom", "parent"), loginId)).toBe(false); // parents never
    expect((await listLoginsFor(viewer("scout"))).map((l) => l.label)).toEqual(["Team Gmail"]);
    expect(await listLoginsFor(viewer("driver"))).toEqual([]);
    expect(await listLoginsFor(viewer("mom", "parent"))).toEqual([]);
  });

  it("gives the right code only to people with access", async () => {
    const { currentCode } = await import("./shared-logins");
    const r = await currentCode(viewer("scout"), loginId, 1111111109 * 1000);
    expect(r).toMatchObject({ ok: true, code: "081804" });
    expect((await currentCode(viewer("driver"), loginId)).ok).toBe(false);
  });

  it("reveals the password, logs who looked, and refuses outsiders", async () => {
    const { revealPassword } = await import("./shared-logins");
    const { db } = await import("@/db");
    const { auditLog } = await import("@/db/schema");
    const r = await revealPassword(viewer("scout"), loginId);
    expect(r).toEqual({ ok: true, password: "hunter2-pw" });
    expect((await revealPassword(viewer("outsider"), loginId)).ok).toBe(false);
    const reveals = (await db.select().from(auditLog)).filter((a) => a.action === "shared_login.reveal");
    expect(reveals).toHaveLength(1);
    expect(reveals[0]!.actorId).toBe(u.scout);
  });

  it("changing groups moves access immediately; a blank password on edit keeps the old one", async () => {
    const { updateLogin, canSeeLogin, revealPassword } = await import("./shared-logins");
    const r = await updateLogin(u.admin!, loginId, { label: "Team Gmail", email: "team@example.com", groupIds: [drivers], password: "", totpSecret: "" });
    expect(r.ok).toBe(true);
    expect(await canSeeLogin(viewer("scout"), loginId)).toBe(false);
    expect(await canSeeLogin(viewer("driver"), loginId)).toBe(true);
    expect(await revealPassword(viewer("driver"), loginId)).toEqual({ ok: true, password: "hunter2-pw" });
  });

  it("deleting a group takes access away from nobody else and does not widen it", async () => {
    const { db } = await import("@/db");
    const { groups } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { canSeeLogin } = await import("./shared-logins");
    await db.delete(groups).where(eq(groups.id, drivers));
    expect(await canSeeLogin(viewer("driver"), loginId)).toBe(false);
    expect(await canSeeLogin(viewer("scout"), loginId)).toBe(false);
    expect(await canSeeLogin(viewer("admin", "admin"), loginId)).toBe(true);
  });

  it("deletes and audits", async () => {
    const { deleteLogin, canSeeLogin } = await import("./shared-logins");
    expect((await deleteLogin(u.admin!, loginId)).ok).toBe(true);
    expect(await canSeeLogin(viewer("admin", "admin"), loginId)).toBe(false);
    const { db } = await import("@/db");
    const { auditLog } = await import("@/db/schema");
    const actions = (await db.select().from(auditLog)).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["shared_login.create", "shared_login.update", "shared_login.reveal", "shared_login.delete"]));
  });
});
