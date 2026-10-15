import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("accounts: sign-up, approval, reset", () => {
  let drop: () => Promise<void>;
  let adminId: string;

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1"; // unreachable on purpose: sends fail fast and must never throw
    process.env.SMTP_FROM = "Command <no-reply@example.com>";
    const t = await createTestDb();
    drop = t.drop;
    const { db } = await import("@/db");
    const { users, teamSettings } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, allowedDomains: ["school.edu"] }).onConflictDoNothing();
    adminId = (await db.insert(users).values({ email: "admin@school.edu", name: "Admin", role: "admin", status: "active" }).returning({ id: users.id }))[0]!.id;
  });
  afterAll(async () => {
    await drop?.();
  });

  it("allowed-domain password sign-up waits for email verification, then auto-approves", async () => {
    const { registerPasswordUser, verifyEmailToken } = await import("./accounts");
    const { db } = await import("@/db");
    const { authTokens, users, accessRequests } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { hashToken } = await import("./auth/tokens");
    const r = await registerPasswordUser({ name: "Kid One", email: "Kid1@School.edu", password: "correct horse battery" });
    expect(r).toMatchObject({ ok: true, outcome: "await_verification" });
    if (!r.ok) return;
    expect((await db.select().from(accessRequests).where(eq(accessRequests.userId, r.userId))).length).toBe(0);
    await db.insert(authTokens).values({ userId: r.userId, kind: "email_verify", tokenHash: hashToken("tok-verify-1234"), expiresAt: new Date(Date.now() + 60_000) });
    expect(await verifyEmailToken("tok-verify-1234")).toMatchObject({ ok: true, status: "active" });
    expect((await db.select().from(users).where(eq(users.id, r.userId)))[0]!.status).toBe("active");
    expect((await verifyEmailToken("tok-verify-1234")).ok).toBe(false); // single use
  });

  it("other-domain sign-up creates an access request and notifies admins; approve activates", async () => {
    const { registerPasswordUser, approveAccessRequest } = await import("./accounts");
    const { db } = await import("@/db");
    const { accessRequests, users, inAppNotifications } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const r = await registerPasswordUser({ name: "Outsider", email: "out@gmail.com", password: "correct horse battery", note: "friend of the team" });
    expect(r).toMatchObject({ ok: true, outcome: "needs_approval" });
    if (!r.ok) return;
    const [req] = await db.select().from(accessRequests).where(eq(accessRequests.userId, r.userId));
    expect(req).toMatchObject({ status: "pending", note: "friend of the team" });
    const notes = await db.select().from(inAppNotifications).where(eq(inAppNotifications.userId, adminId));
    expect(notes.some((n) => n.body?.includes("out@gmail.com"))).toBe(true);
    expect(await approveAccessRequest(adminId, req!.id, "lead")).toEqual({ ok: true });
    const [u] = await db.select().from(users).where(eq(users.id, r.userId));
    expect(u).toMatchObject({ status: "active", role: "lead" });
    expect((await approveAccessRequest(adminId, req!.id)).ok).toBe(false); // already handled
  });

  it("denial blocks sign-in with the reason", async () => {
    const { registerPasswordUser, denyAccessRequest, statusGate } = await import("./accounts");
    const { db } = await import("@/db");
    const { accessRequests, users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const r = await registerPasswordUser({ name: "Nope", email: "nope@gmail.com", password: "correct horse battery" });
    if (!r.ok) throw new Error("signup failed");
    const [req] = await db.select().from(accessRequests).where(eq(accessRequests.userId, r.userId));
    await denyAccessRequest(adminId, req!.id, "Not on the roster");
    const [u] = await db.select().from(users).where(eq(users.id, r.userId));
    const gate = await statusGate(u!);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.error).toContain("Not on the roster");
  });

  it("rejects duplicate emails regardless of case", async () => {
    const { registerPasswordUser } = await import("./accounts");
    const r = await registerPasswordUser({ name: "Dup", email: "ADMIN@school.edu", password: "correct horse battery" });
    expect(r.ok).toBe(false);
  });

  it("google: unverified email never signs in; verified allowed domain auto-approves; other domain queues", async () => {
    const { resolveGoogleLogin } = await import("./accounts");
    const { db } = await import("@/db");
    const { users, accessRequests } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    expect((await resolveGoogleLogin({ sub: "g1", email: "x@school.edu", emailVerified: false, name: "X", picture: null }, "login")).ok).toBe(false);
    const ok = await resolveGoogleLogin({ sub: "g2", email: "y@school.edu", emailVerified: true, name: "Y", picture: null }, "login");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect((await db.select().from(users).where(eq(users.id, ok.userId)))[0]!.status).toBe("active");
    const q = await resolveGoogleLogin({ sub: "g3", email: "z@gmail.com", emailVerified: true, name: "Z", picture: null }, "login");
    expect(q.ok).toBe(true);
    if (q.ok) {
      expect((await db.select().from(users).where(eq(users.id, q.userId)))[0]!.status).toBe("pending");
      expect((await db.select().from(accessRequests).where(eq(accessRequests.userId, q.userId))).length).toBe(1);
    }
  });

  it("google: stores the profile photo for new users and refreshes it for returning ones", async () => {
    const { resolveGoogleLogin } = await import("./accounts");
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const first = "https://lh3.googleusercontent.com/a/one=s96-c";
    const second = "https://lh3.googleusercontent.com/a/two=s96-c";
    const r = await resolveGoogleLogin({ sub: "g6", email: "pic@school.edu", emailVerified: true, name: "Pic", picture: first }, "login");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await db.select().from(users).where(eq(users.id, r.userId)))[0]!.avatarUrl).toBe(first);
    await resolveGoogleLogin({ sub: "g6", email: "pic@school.edu", emailVerified: true, name: "Pic", picture: second }, "login");
    expect((await db.select().from(users).where(eq(users.id, r.userId)))[0]!.avatarUrl).toBe(second);
    // A login without a usable photo keeps the one we have.
    await resolveGoogleLogin({ sub: "g6", email: "pic@school.edu", emailVerified: true, name: "Pic", picture: null }, "login");
    expect((await db.select().from(users).where(eq(users.id, r.userId)))[0]!.avatarUrl).toBe(second);
  });

  it("google parent intent creates an active parent on any domain and refuses team-member emails", async () => {
    const { resolveGoogleLogin } = await import("./accounts");
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const p = await resolveGoogleLogin({ sub: "g4", email: "mom@gmail.com", emailVerified: true, name: "Mom", picture: null }, "parent");
    expect(p.ok).toBe(true);
    if (p.ok) expect((await db.select().from(users).where(eq(users.id, p.userId)))[0]).toMatchObject({ role: "parent", status: "active" });
    const clash = await resolveGoogleLogin({ sub: "g5", email: "admin@school.edu", emailVerified: true, name: "A", picture: null }, "parent");
    expect(clash.ok).toBe(false);
  });

  it("password reset link works once and expires", async () => {
    const { resetPasswordWithToken } = await import("./accounts");
    const { db } = await import("@/db");
    const { authTokens } = await import("@/db/schema");
    const { hashToken } = await import("./auth/tokens");
    await db.insert(authTokens).values([
      { userId: adminId, kind: "password_reset", tokenHash: hashToken("reset-good-123"), expiresAt: new Date(Date.now() + 60_000) },
      { userId: adminId, kind: "password_reset", tokenHash: hashToken("reset-old-1234"), expiresAt: new Date(Date.now() - 1000) },
    ]);
    expect((await resetPasswordWithToken("reset-old-1234", "brand new password")).ok).toBe(false);
    expect((await resetPasswordWithToken("reset-good-123", "brand new password")).ok).toBe(true);
    expect((await resetPasswordWithToken("reset-good-123", "another password!")).ok).toBe(false);
  });
});
