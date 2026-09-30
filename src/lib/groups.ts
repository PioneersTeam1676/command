import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { groupMembers, groups, signupSlotGroups, signupSlots, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";

export type GroupRow = typeof groups.$inferSelect;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };

export const groupFormSchema = z.object({
  name: z.string().trim().min(1, "Give the group a name.").max(60, "Keep the name under 60 characters."),
  description: z.string().trim().max(300).optional().transform((v) => v || undefined),
});
export type GroupFormInput = Omit<z.infer<typeof groupFormSchema>, "description"> & { description?: string };

/** Every group with how many active people are in it and how many upcoming shifts it gates. */
export async function listGroups() {
  const rows = await db.select().from(groups).orderBy(asc(groups.name));
  if (rows.length === 0) return [];
  const ids = rows.map((g) => g.id);
  const members = await db
    .select({ groupId: groupMembers.groupId, n: sql<number>`count(*)::int` })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(inArray(groupMembers.groupId, ids), eq(users.status, "active")))
    .groupBy(groupMembers.groupId);
  const shifts = await db
    .select({ groupId: signupSlotGroups.groupId, n: sql<number>`count(*)::int` })
    .from(signupSlotGroups)
    .innerJoin(signupSlots, eq(signupSlots.id, signupSlotGroups.slotId))
    .where(and(inArray(signupSlotGroups.groupId, ids), gt(signupSlots.endsAt, new Date())))
    .groupBy(signupSlotGroups.groupId);
  return rows.map((g) => ({ ...g, memberCount: members.find((m) => m.groupId === g.id)?.n ?? 0, upcomingShifts: shifts.find((s) => s.groupId === g.id)?.n ?? 0 }));
}

export async function getGroup(id: string): Promise<GroupRow | undefined> {
  const [g] = await db.select().from(groups).where(eq(groups.id, id));
  return g;
}

export async function createGroup(actorId: string, input: GroupFormInput): Promise<Result<{ id: string }>> {
  try {
    const [row] = await db.insert(groups).values({ name: input.name, description: input.description ?? null }).returning();
    await audit({ actorId, action: "group.create", targetType: "group", targetId: row!.id, after: { name: row!.name } });
    return { ok: true, id: row!.id };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "There's already a group with that name.", field: "name" };
    throw e;
  }
}

export async function updateGroup(actorId: string, id: string, input: GroupFormInput): Promise<Result> {
  const before = await getGroup(id);
  if (!before) return { ok: false, error: "That group doesn't exist." };
  try {
    await db.update(groups).set({ name: input.name, description: input.description ?? null }).where(eq(groups.id, id));
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "There's already a group with that name.", field: "name" };
    throw e;
  }
  await audit({ actorId, action: "group.update", targetType: "group", targetId: id, before: { name: before.name, description: before.description }, after: { name: input.name, description: input.description ?? null } });
  return { ok: true };
}

/**
 * Deleting a group takes everyone out of it. It is refused while any shift is still reserved for it,
 * because dropping the group would quietly open those shifts to the whole team.
 */
export async function deleteGroup(actorId: string, id: string): Promise<Result> {
  const before = await getGroup(id);
  if (!before) return { ok: false, error: "That group doesn't exist." };
  const [used] = await db.select({ n: sql<number>`count(*)::int` }).from(signupSlotGroups).where(eq(signupSlotGroups.groupId, id));
  if ((used?.n ?? 0) > 0) return { ok: false, error: `“${before.name}” is still set on ${used!.n} ${used!.n === 1 ? "shift" : "shifts"}. Take it off those shifts first, so they don't open to everyone by accident.` };
  await db.transaction(async (tx) => {
    await tx.delete(groups).where(eq(groups.id, id));
    await audit({ actorId, action: "group.delete", targetType: "group", targetId: id, before: { name: before.name } }, tx);
  });
  return { ok: true };
}

/** Active people in a group, for the admin page. Includes email so admins can tell namesakes apart. */
export async function groupMembersOf(groupId: string) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), eq(users.status, "active")))
    .orderBy(asc(users.name));
}

/** Active people not yet in the group, to pick from. */
export async function peopleNotInGroup(groupId: string) {
  const inGroup = db.select({ id: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(and(eq(users.status, "active"), sql`${users.id} not in (${inGroup})`))
    .orderBy(asc(users.name));
}

export async function addGroupMembers(actorId: string, groupId: string, userIds: string[]): Promise<Result<{ added: number }>> {
  const group = await getGroup(groupId);
  if (!group) return { ok: false, error: "That group doesn't exist." };
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return { ok: false, error: "Pick at least one person." };
  const real = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.status, "active")));
  if (real.length === 0) return { ok: false, error: "Those people can't be added." };
  const inserted = await db.insert(groupMembers).values(real.map((u) => ({ groupId, userId: u.id }))).onConflictDoNothing().returning({ userId: groupMembers.userId });
  if (inserted.length > 0) await audit({ actorId, action: "group.add_members", targetType: "group", targetId: groupId, after: { name: group.name, userIds: inserted.map((i) => i.userId) } });
  return { ok: true, added: inserted.length };
}

export async function removeGroupMember(actorId: string, groupId: string, userId: string): Promise<Result> {
  const group = await getGroup(groupId);
  if (!group) return { ok: false, error: "That group doesn't exist." };
  const removed = await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))).returning({ userId: groupMembers.userId });
  if (removed.length > 0) await audit({ actorId, action: "group.remove_member", targetType: "group", targetId: groupId, before: { name: group.name, userId } });
  return { ok: true };
}

export async function groupIdsForUser(userId: string, reader: Pick<typeof db, "select"> = db): Promise<string[]> {
  const rows = await reader.select({ id: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, userId));
  return rows.map((r) => r.id);
}
