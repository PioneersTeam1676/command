"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { acceptSession, editSessionTimes, rejectSession, resolveOverlap } from "@/lib/attendance";
import { requireActionUser } from "@/lib/auth/current-user";
import { getSettings } from "@/lib/settings";
import { fromDatetimeLocal } from "@/lib/time";
import { optionalText, uuidSchema } from "@/lib/validation";

const refresh = () => {
  revalidatePath("/admin/review");
  revalidatePath("/me/hours");
};

export async function acceptSessionAction(formData: FormData) {
  const actor = await requireActionUser("lead");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await acceptSession(actor.id, id.data);
  refresh();
}

export async function rejectSessionAction(formData: FormData) {
  const actor = await requireActionUser("lead");
  const p = z.object({ id: uuidSchema, reason: optionalText(200) }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  await rejectSession(actor.id, p.data.id, p.data.reason);
  refresh();
}

export async function editSessionEndAction(formData: FormData) {
  const actor = await requireActionUser("lead");
  const p = z.object({ id: uuidSchema, outAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const { timezone } = await getSettings();
  await editSessionTimes(actor.id, p.data.id, { outAt: fromDatetimeLocal(p.data.outAt, timezone) });
  refresh();
}

export async function resolveOverlapAction(formData: FormData) {
  const actor = await requireActionUser("lead");
  const p = z.object({ aId: uuidSchema, bId: uuidSchema, action: z.enum(["merge", "keep_a", "keep_b"]) }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  await resolveOverlap(actor.id, p.data);
  refresh();
}
