import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("parent access scoping", () => {
  let drop: () => Promise<void>;
  let ids: { parent: string; otherParent: string; studentA: string; studentB: string; studentC: string };

  beforeAll(async () => {
    const t = await createTestDb();
    drop = t.drop;
    const { db } = await import("@/db");
    const { users, parentLinks } = await import("@/db/schema");
    const mk = async (email: string, role: "member" | "parent") =>
      (await db.insert(users).values({ email, name: email.split("@")[0]!, role, status: "active" }).returning({ id: users.id }))[0]!.id;
    ids = {
      parent: await mk("p1@example.com", "parent"),
      otherParent: await mk("p2@example.com", "parent"),
      studentA: await mk("a@school.edu", "member"),
      studentB: await mk("b@school.edu", "member"),
      studentC: await mk("c@school.edu", "member"),
    };
    const base = { relationship: "Mother", fullName: "P One" };
    await db.insert(parentLinks).values([
      { ...base, parentId: ids.parent, studentId: ids.studentA, status: "approved" },
      { ...base, parentId: ids.parent, studentId: ids.studentB, status: "pending" },
      { ...base, parentId: ids.otherParent, studentId: ids.studentB, status: "approved" },
    ]);
  });
  afterAll(async () => {
    await drop?.();
  });

  it("returns only the approved student", async () => {
    const { approvedStudentIds } = await import("./parent-scope");
    expect(await approvedStudentIds(ids.parent)).toEqual([ids.studentA]);
  });

  it("lets a parent read their approved student", async () => {
    const { requireStudent, studentDisplay } = await import("./parent-scope");
    expect(await requireStudent(ids.parent, ids.studentA)).toBe(ids.studentA);
    const d = await studentDisplay(ids.parent, ids.studentA);
    expect(Object.keys(d).sort()).toEqual(["id", "name"]); // never email or role
  });

  it("refuses another student's id (tampering with the URL)", async () => {
    const { requireStudent, studentDisplay, ParentScopeError } = await import("./parent-scope");
    await expect(requireStudent(ids.parent, ids.studentB)).rejects.toBeInstanceOf(ParentScopeError); // only pending
    await expect(requireStudent(ids.parent, ids.studentC)).rejects.toBeInstanceOf(ParentScopeError); // no link at all
    await expect(studentDisplay(ids.parent, ids.studentB)).rejects.toBeInstanceOf(ParentScopeError);
    await expect(requireStudent(ids.otherParent, ids.studentA)).rejects.toBeInstanceOf(ParentScopeError); // someone else's link
  });

  it("refuses non-approved and revoked links, and deactivated students", async () => {
    const { db } = await import("@/db");
    const { parentLinks, users } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { requireStudent, ParentScopeError } = await import("./parent-scope");
    for (const status of ["denied", "needs_info", "pending"]) {
      await db.update(parentLinks).set({ status }).where(and(eq(parentLinks.parentId, ids.parent), eq(parentLinks.studentId, ids.studentA)));
      await expect(requireStudent(ids.parent, ids.studentA)).rejects.toBeInstanceOf(ParentScopeError);
    }
    await db.update(parentLinks).set({ status: "approved", revokedAt: new Date() }).where(and(eq(parentLinks.parentId, ids.parent), eq(parentLinks.studentId, ids.studentA)));
    await expect(requireStudent(ids.parent, ids.studentA)).rejects.toBeInstanceOf(ParentScopeError);
    await db.update(parentLinks).set({ revokedAt: null }).where(and(eq(parentLinks.parentId, ids.parent), eq(parentLinks.studentId, ids.studentA)));
    await expect(requireStudent(ids.parent, ids.studentA)).resolves.toBe(ids.studentA);
    await db.update(users).set({ status: "deactivated" }).where(eq(users.id, ids.studentA));
    await expect(requireStudent(ids.parent, ids.studentA)).rejects.toBeInstanceOf(ParentScopeError);
  });
});
