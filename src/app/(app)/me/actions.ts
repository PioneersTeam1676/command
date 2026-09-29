"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hit } from "@/lib/auth/rate-limit";
import { requireActionUser } from "@/lib/auth/current-user";
import type { FormState } from "@/lib/form";
import { createParentInvite, revokeInvite, revokeParentLink } from "@/lib/parents";
import { uuidSchema } from "@/lib/validation";

export async function createInviteAction(): Promise<FormState> {
  const user = await requireActionUser("member");
  if (!(await hit(`parent-invite:${user.id}`, 10, 86400)).allowed) return { error: "You've made a lot of invite links today. Try again tomorrow." };
  const { url } = await createParentInvite(user.id);
  revalidatePath("/me");
  return { success: "Invite link created. Copy it now and send it to your parent. It works for 7 days.", data: { url } };
}

export async function revokeInviteAction(formData: FormData) {
  const user = await requireActionUser("member");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await revokeInvite(user.id, id.data);
  revalidatePath("/me");
}

export async function studentRevokeLinkAction(formData: FormData) {
  const user = await requireActionUser("member");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await revokeParentLink(user.id, id.data, { onlyStudentId: user.id });
  revalidatePath("/me");
}
