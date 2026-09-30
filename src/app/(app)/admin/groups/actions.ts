"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionUser } from "@/lib/auth/current-user";
import { parseForm, type FormState } from "@/lib/form";
import { addGroupMembers, createGroup, deleteGroup, groupFormSchema, removeGroupMember, updateGroup } from "@/lib/groups";
import { uuidSchema } from "@/lib/validation";

const refresh = () => {
  revalidatePath("/admin/groups");
  revalidatePath("/calendar", "layout");
};

export async function createGroupAction(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const parsed = parseForm(groupFormSchema, fd, { keepValues: ["name", "description"] });
  if (!parsed.ok) return parsed.state;
  const r = await createGroup(admin.id, parsed.data);
  if (!r.ok) return { error: r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined, values: { name: String(fd.get("name") ?? ""), description: String(fd.get("description") ?? "") } };
  refresh();
  return { success: "Group created. Add people to it below." };
}

export async function updateGroupAction(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const id = uuidSchema.safeParse(fd.get("id"));
  if (!id.success) return { error: "Unknown group." };
  const parsed = parseForm(groupFormSchema, fd, { keepValues: ["name", "description"] });
  if (!parsed.ok) return parsed.state;
  const r = await updateGroup(admin.id, id.data, parsed.data);
  if (!r.ok) return { error: r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined, values: { name: String(fd.get("name") ?? ""), description: String(fd.get("description") ?? "") } };
  refresh();
  return { success: "Saved." };
}

/** Goes back to the page with the reason when a group can't be deleted, like the people page does. */
export async function deleteGroupAction(fd: FormData) {
  const admin = await requireActionUser("admin");
  const id = uuidSchema.safeParse(fd.get("id"));
  if (!id.success) return;
  const r = await deleteGroup(admin.id, id.data);
  refresh();
  if (!r.ok) redirect(`/admin/groups?error=${encodeURIComponent(r.error)}`);
}

export async function addMembersAction(fd: FormData) {
  const admin = await requireActionUser("admin");
  const p = z.object({ id: uuidSchema, userIds: z.array(uuidSchema).max(500) }).safeParse({ id: fd.get("id"), userIds: fd.getAll("userIds") });
  if (!p.success) return;
  await addGroupMembers(admin.id, p.data.id, p.data.userIds);
  refresh();
}

export async function removeMemberAction(fd: FormData) {
  const admin = await requireActionUser("admin");
  const p = z.object({ id: uuidSchema, userId: uuidSchema }).safeParse(Object.fromEntries(fd));
  if (!p.success) return;
  await removeGroupMember(admin.id, p.data.id, p.data.userId);
  refresh();
}
