"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/lib/auth/current-user";
import { cancelEvent, createEvent, deleteEvent, eventFormSchema, RSVP_RESPONSES, setRsvp, updateEvent } from "@/lib/events";
import { parseForm, type FormState } from "@/lib/form";
import { uuidSchema } from "@/lib/validation";

const KEEP = ["title", "description", "locationText", "startsAt", "endsAt", "verification"];

export async function createEventAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireActionUser("lead");
  const parsed = parseForm(eventFormSchema, formData, { keepValues: KEEP });
  if (!parsed.ok) return parsed.state;
  const r = await createEvent(user.id, parsed.data);
  if (!r.ok) return { error: r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined, values: Object.fromEntries(KEEP.map((k) => [k, String(formData.get(k) ?? "")])) };
  revalidatePath("/calendar");
  redirect(`/calendar/${r.id}`);
}

export async function updateEventAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireActionUser("lead");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Unknown event." };
  const parsed = parseForm(eventFormSchema, formData, { keepValues: KEEP });
  if (!parsed.ok) return parsed.state;
  const r = await updateEvent(user.id, id.data, parsed.data);
  if (!r.ok) return { error: r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined, values: Object.fromEntries(KEEP.map((k) => [k, String(formData.get(k) ?? "")])) };
  revalidatePath("/calendar");
  redirect(`/calendar/${id.data}`);
}

export async function cancelEventAction(formData: FormData) {
  const user = await requireActionUser("lead");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await cancelEvent(user.id, id.data);
  revalidatePath("/calendar");
  revalidatePath(`/calendar/${id.data}`);
}

const rsvpSchema = z.object({ eventId: uuidSchema, response: z.enum(RSVP_RESPONSES), reason: z.string().max(300).optional() });

export async function rsvpAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireActionUser("member");
  const p = rsvpSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: "Choose Going, Maybe or Can't go." };
  const r = await setRsvp(user.id, p.data.eventId, p.data.response, p.data.reason);
  if (!r.ok) return { error: r.error };
  revalidatePath(`/calendar/${p.data.eventId}`);
  return { success: "Saved. You can change your answer any time before the event ends." };
}

/** One-tap RSVP from the Home screen (no reason field). */
export async function rsvpQuickAction(formData: FormData): Promise<void> {
  const user = await requireActionUser("member");
  const p = z.object({ eventId: uuidSchema, response: z.enum(RSVP_RESPONSES) }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  await setRsvp(user.id, p.data.eventId, p.data.response);
  revalidatePath("/");
  revalidatePath("/calendar");
}

/** Permanent delete from the event page. Returns to the calendar on success; the page shows why when it's refused. */
export async function deleteEventAction(formData: FormData) {
  const user = await requireActionUser("lead");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const r = await deleteEvent(user.id, id.data);
  revalidatePath("/calendar");
  if (r.ok) redirect("/calendar");
  redirect(`/calendar/${id.data}?deleteError=${encodeURIComponent(r.error)}`);
}
