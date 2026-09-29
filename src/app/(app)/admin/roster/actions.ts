"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addSessionForUser, editSessionTimes, forceClockOut } from "@/lib/attendance";
import { requireActionUser } from "@/lib/auth/current-user";
import { parseForm, type FormState } from "@/lib/form";
import { getSettings } from "@/lib/settings";
import { fromDatetimeLocal } from "@/lib/time";
import { uuidSchema } from "@/lib/validation";

const refresh = (userId?: string) => {
  revalidatePath("/admin/here");
  revalidatePath("/admin/roster");
  if (userId) revalidatePath(`/admin/roster/${userId}`);
  revalidatePath("/admin/review");
};

export async function forceClockOutAction(formData: FormData) {
  const actor = await requireActionUser("lead");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await forceClockOut(actor.id, id.data);
  refresh(String(formData.get("userId") ?? ""));
}

const dt = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a date and time.");

export async function editTimesAction(formData: FormData) {
  const actor = await requireActionUser("lead");
  const p = z.object({ id: uuidSchema, inAt: dt, outAt: dt, userId: uuidSchema }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  const { timezone } = await getSettings();
  await editSessionTimes(actor.id, p.data.id, { inAt: fromDatetimeLocal(p.data.inAt, timezone), outAt: fromDatetimeLocal(p.data.outAt, timezone) });
  refresh(p.data.userId);
}

const addSchema = z.object({ userId: uuidSchema, inAt: dt, outAt: dt, note: z.string().trim().max(300).optional() });

export async function addTimeAction(_: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActionUser("lead");
  const p = parseForm(addSchema, formData, { keepValues: ["inAt", "outAt", "note"] });
  if (!p.ok) return p.state;
  const { timezone } = await getSettings();
  const r = await addSessionForUser(actor.id, { userId: p.data.userId, kind: "open", inAt: fromDatetimeLocal(p.data.inAt, timezone), outAt: fromDatetimeLocal(p.data.outAt, timezone), note: p.data.note });
  if (!r.ok) return { error: r.error, values: { inAt: p.data.inAt, outAt: p.data.outAt, note: p.data.note ?? "" } };
  refresh(p.data.userId);
  return { success: "Added. It counts toward their hours now." };
}
