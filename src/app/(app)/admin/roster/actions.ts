"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addSessionForUser, deleteSessionForever, editSessionTimes, eventDay, forceClockOut } from "@/lib/attendance";
import { requireActionUser } from "@/lib/auth/current-user";
import { parseForm, type FormState } from "@/lib/form";
import { getSettings } from "@/lib/settings";
import { fromDatetimeLocal, localToUtc } from "@/lib/time";
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

const time = z.string().regex(/^\d{2}:\d{2}$/, "Enter a time.");
const addSchema = z
  .object({
    userId: uuidSchema,
    buildSeason: z.literal("on").optional(),
    eventId: z.string().optional(),
    date: z.string().optional(),
    inTime: time,
    outTime: time,
    note: z.string().trim().max(300).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.buildSeason) {
      if (!v.date || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) ctx.addIssue({ code: "custom", path: ["date"], message: "Choose a date." });
    } else if (!uuidSchema.safeParse(v.eventId).success) {
      ctx.addIssue({ code: "custom", path: ["eventId"], message: "Choose an event, or tick build season." });
    }
  });

/** Lead/admin adds time for a member: an event (day comes from the event) or a build season day. */
export async function addTimeAction(_: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActionUser("lead");
  const p = parseForm(addSchema, formData, { keepValues: ["buildSeason", "eventId", "date", "inTime", "outTime", "note"] });
  if (!p.ok) return p.state;
  const { userId, buildSeason, eventId, inTime, outTime, note } = p.data;
  const values = { buildSeason: buildSeason ?? "", eventId: eventId ?? "", date: p.data.date ?? "", inTime, outTime, note: note ?? "" };
  const day = buildSeason ? p.data.date! : await eventDay(eventId!);
  if (!day) return { error: "We couldn't find that event.", values };
  const { timezone } = await getSettings();
  let inAt: Date, outAt: Date;
  try {
    inAt = localToUtc(day, inTime, timezone);
    outAt = localToUtc(day, outTime, timezone);
  } catch {
    return { error: "Enter a valid date and times.", values };
  }
  const r = await addSessionForUser(actor.id, { userId, kind: buildSeason ? "open" : "event", eventId: buildSeason ? undefined : eventId, inAt, outAt, note });
  if (!r.ok) return { error: r.error, values };
  refresh(p.data.userId);
  return { success: "Added. It counts toward their hours now." };
}

/** Admin only. Removes the entry and everything that mentions it. Deliberately not audited. */
export async function deleteSessionAction(formData: FormData) {
  await requireActionUser("admin");
  const p = z.object({ id: uuidSchema, userId: uuidSchema }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  await deleteSessionForever(p.data.id);
  refresh(p.data.userId);
  revalidatePath("/me/hours");
}
