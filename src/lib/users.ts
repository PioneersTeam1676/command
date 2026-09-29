import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, parentInvites, parentLinks, pushSubscriptions, sessions, users, type Role } from "@/db/schema";
import { audit } from "@/lib/audit";

export async function listUsers() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .orderBy(asc(users.name));
}

async function activeAdminCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
  return row?.n ?? 0;
}

type Result = { ok: true } | { ok: false; error: string };

export async function changeRole(actorId: string, userId: string, role: Role): Promise<Result> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return { ok: false, error: "User not found." };
  if (u.role === "parent") return { ok: false, error: "Parent accounts can't be given a team role." };
  if (role === "parent") return { ok: false, error: "Choose Member, Lead or Admin." };
  if (u.role === "admin" && role !== "admin" && u.status === "active" && (await activeAdminCount()) <= 1) {
    return { ok: false, error: "Every team needs at least one admin. Make someone else an admin first." };
  }
  await db.update(users).set({ role }).where(eq(users.id, userId));
  await audit({ actorId, action: "user.change_role", targetType: "user", targetId: userId, before: { role: u.role }, after: { role } });
  return { ok: true };
}

export async function deactivateUser(actorId: string, userId: string): Promise<Result> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return { ok: false, error: "User not found." };
  if (u.status === "deactivated") return { ok: true };
  if (u.role === "admin" && u.status === "active" && (await activeAdminCount()) <= 1) {
    return { ok: false, error: "You can't deactivate the only admin." };
  }
  await db.transaction(async (tx) => {
    await tx.update(users).set({ status: "deactivated" }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId)); // ends all sessions
    await tx.update(pushSubscriptions).set({ disabledAt: new Date() }).where(eq(pushSubscriptions.userId, userId)); // stops notifications
    await audit({ actorId, action: "user.deactivate", targetType: "user", targetId: userId, before: { status: u.status }, after: { status: "deactivated" } }, tx);
  });
  return { ok: true };
}

export async function reactivateUser(actorId: string, userId: string): Promise<Result> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return { ok: false, error: "User not found." };
  await db.update(users).set({ status: "active" }).where(eq(users.id, userId));
  await audit({ actorId, action: "user.reactivate", targetType: "user", targetId: userId, before: { status: u.status }, after: { status: "active" } });
  return { ok: true };
}

/**
 * Permanently erase a person's personal data on request. Their attendance rows stay (so season
 * totals still add up) but are no longer tied to a name, email, login or device.
 */
export async function erasePersonalData(actorId: string, userId: string): Promise<Result> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return { ok: false, error: "User not found." };
  if (userId === actorId) return { ok: false, error: "You can't erase your own account." };
  if (u.role === "admin" && u.status === "active" && (await activeAdminCount()) <= 1) {
    return { ok: false, error: "You can't erase the only admin." };
  }
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        name: "Former member",
        email: `deleted-${userId}@deleted.invalid`,
        passwordHash: null,
        googleSub: null,
        status: "deactivated",
        leaderboardHidden: true,
        emailVerifiedAt: null,
      })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    await tx.delete(parentInvites).where(eq(parentInvites.studentId, userId));
    await tx
      .update(parentLinks)
      .set({ fullName: "Removed", phone: null, note: null, revokedAt: new Date() })
      .where(eq(parentLinks.parentId, userId));
    await tx.update(parentLinks).set({ revokedAt: new Date() }).where(eq(parentLinks.studentId, userId));
    await tx.update(accessRequests).set({ note: null }).where(eq(accessRequests.userId, userId));
    await audit({ actorId, action: "user.erase_personal_data", targetType: "user", targetId: userId }, tx);
  });
  return { ok: true };
}
