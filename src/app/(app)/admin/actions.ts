"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminResetPassword, approveAccessRequest, denyAccessRequest } from "@/lib/accounts";
import { requireActionUser } from "@/lib/auth/current-user";
import { decideParentLink, revokeParentLink } from "@/lib/parents";
import { changeRole, deactivateUser, deleteUser, erasePersonalData, reactivateUser } from "@/lib/users";
import { optionalText, uuidSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form";

const refresh = () => {
  revalidatePath("/admin/review");
  revalidatePath("/admin/people");
};

export async function approveAccessAction(formData: FormData) {
  const admin = await requireActionUser("admin");
  const p = z.object({ id: uuidSchema, role: z.enum(["member", "lead", "admin"]).default("member") }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  await approveAccessRequest(admin.id, p.data.id, p.data.role);
  refresh();
}

export async function denyAccessAction(formData: FormData) {
  const admin = await requireActionUser("admin");
  const p = z.object({ id: uuidSchema, reason: optionalText(300) }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  await denyAccessRequest(admin.id, p.data.id, p.data.reason);
  refresh();
}

export async function decideParentAction(formData: FormData) {
  const admin = await requireActionUser("admin");
  const p = z
    .object({ id: uuidSchema, decision: z.enum(["approved", "denied", "needs_info"]), message: optionalText(500) })
    .safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  await decideParentLink(admin.id, p.data.id, p.data.decision, p.data.message);
  refresh();
}

export async function adminRevokeParentLinkAction(formData: FormData) {
  const admin = await requireActionUser("admin");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await revokeParentLink(admin.id, id.data);
  refresh();
}

export async function changeRoleAction(formData: FormData) {
  const admin = await requireActionUser("admin");
  const p = z.object({ id: uuidSchema, role: z.enum(["member", "lead", "admin"]) }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  await changeRole(admin.id, p.data.id, p.data.role);
  refresh();
}

export async function deactivateAction(formData: FormData) {
  const admin = await requireActionUser("admin");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await deactivateUser(admin.id, id.data);
  refresh();
}

export async function reactivateAction(formData: FormData) {
  const admin = await requireActionUser("admin");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await reactivateUser(admin.id, id.data);
  refresh();
}

export async function eraseAction(formData: FormData) {
  const admin = await requireActionUser("admin");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await erasePersonalData(admin.id, id.data);
  refresh();
}

export async function deleteUserAction(formData: FormData) {
  const admin = await requireActionUser("admin");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await deleteUser(admin.id, id.data);
  refresh();
}

export async function resetPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Unknown user." };
  const r = await adminResetPassword(admin.id, id.data);
  if (!r.ok) return { error: r.error };
  return r.mode === "emailed"
    ? { success: "We emailed them a link to choose a new password." }
    : { success: "Temporary password created. It is shown once. They must change it at next sign-in.", data: { password: r.password } };
}
