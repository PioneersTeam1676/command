"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addBackfill, eventDay } from "@/lib/attendance";
import { requestDelete, requestEdit } from "@/lib/attendance-requests";
import { requireActionUser } from "@/lib/auth/current-user";
import { parseForm, type FormState } from "@/lib/form";
import { uuidSchema } from "@/lib/validation";

const dt = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a date and time.");
const note = z.string().trim().max(300).optional();

const time = z.string().regex(/^\d{2}:\d{2}$/, "Enter a time.");
const eventSchema = z.object({ eventId: uuidSchema, inTime: time, outTime: time, note });
const daySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a day."), inTime: time, outTime: time, note });

export async function backfillEventAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireActionUser("member");
  const p = parseForm(eventSchema, formData, { keepValues: ["eventId", "inTime", "outTime", "note"] });
  if (!p.ok) return p.state;
  const { eventId, inTime, outTime, note } = p.data;
  const values = { eventId, inTime, outTime, note: note ?? "" };
  // The event already fixes the day; members only enter times.
  const day = await eventDay(eventId);
  if (!day) return { error: "We couldn't find that event.", values };
  const r = await addBackfill(user.id, { kind: "event", eventId, inAt: `${day}T${inTime}`, outAt: `${day}T${outTime}`, note });
  if (!r.ok) return { error: r.error, values };
  revalidatePath("/me/hours");
  return { success: "Sent, marked as manually added. It will count once a lead or admin approves it." };
}

export async function backfillDayAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireActionUser("member");
  const p = parseForm(daySchema, formData, { keepValues: ["date", "inTime", "outTime", "note"] });
  if (!p.ok) return p.state;
  const { date, inTime, outTime, note } = p.data;
  const r = await addBackfill(user.id, { kind: "open", date, inAt: `${date}T${inTime}`, outAt: `${date}T${outTime}`, note });
  if (!r.ok) return { error: r.error, values: { date, inTime, outTime, note: note ?? "" } };
  revalidatePath("/me/hours");
  return { success: "Sent, marked as manually added. It will count once a lead or admin approves it." };
}

const reason = z.string().trim().min(3, "Say briefly why.").max(300);

export async function requestEditAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireActionUser("member");
  const p = parseForm(z.object({ id: uuidSchema, inAt: dt, outAt: dt, reason }), formData, { keepValues: ["inAt", "outAt", "reason"] });
  if (!p.ok) return p.state;
  const r = await requestEdit(user.id, p.data.id, { inAt: p.data.inAt, outAt: p.data.outAt, reason: p.data.reason });
  if (!r.ok) return { error: r.error, values: { inAt: p.data.inAt, outAt: p.data.outAt, reason: p.data.reason } };
  revalidatePath("/me/hours");
  revalidatePath("/admin/review");
  return { success: "Changed. Your hours are updated now, and a lead will check it." };
}

export async function requestRemovalAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireActionUser("member");
  const p = parseForm(z.object({ id: uuidSchema, reason }), formData, { keepValues: ["reason"] });
  if (!p.ok) return p.state;
  const r = await requestDelete(user.id, p.data.id, p.data.reason);
  if (!r.ok) return { error: r.error, values: { reason: p.data.reason } };
  revalidatePath("/me/hours");
  revalidatePath("/admin/review");
  return { success: "Removed from your hours. A lead will check it." };
}
