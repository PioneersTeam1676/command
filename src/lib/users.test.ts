import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("user management guards", () => {
  let drop: () => Promise<void>;
  let admin: string;
  let member: string;
  beforeAll(async () => {
    const t = await createTestDb();
    drop = t.drop;
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const rows = await db
      .insert(users)
      .values([
        { email: "a@x.com", name: "A", role: "admin", status: "active" },
        { email: "m@x.com", name: "M", role: "member", status: "active" },
      ])
      .returning({ id: users.id, role: users.role });
    admin = rows.find((r) => r.role === "admin")!.id;
    member = rows.find((r) => r.role === "member")!.id;
  });
  afterAll(async () => {
    await drop?.();
  });

  it("refuses to demote, deactivate or erase the only admin", async () => {
    const { changeRole, deactivateUser, erasePersonalData } = await import("./users");
    expect((await changeRole(member, admin, "member")).ok).toBe(false);
    expect((await deactivateUser(member, admin)).ok).toBe(false);
    expect((await erasePersonalData(member, admin)).ok).toBe(false);
  });

  it("deactivation ends sessions and is audited", async () => {
    const { deactivateUser } = await import("./users");
    const { db } = await import("@/db");
    const { sessions, auditLog } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.insert(sessions).values({ id: "s1", userId: member, expiresAt: new Date(Date.now() + 100000) });
    expect((await deactivateUser(admin, member)).ok).toBe(true);
    expect((await db.select().from(sessions).where(eq(sessions.userId, member))).length).toBe(0);
    expect((await db.select().from(auditLog).where(eq(auditLog.action, "user.deactivate"))).length).toBe(1);
  });

  it("erasing personal data removes identity but keeps the row", async () => {
    const { erasePersonalData } = await import("./users");
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    expect((await erasePersonalData(admin, member)).ok).toBe(true);
    const [u] = await db.select().from(users).where(eq(users.id, member));
    expect(u).toMatchObject({ name: "Former member", status: "deactivated", passwordHash: null, googleSub: null });
    expect(u!.email).toContain("deleted.invalid");
  });
});
