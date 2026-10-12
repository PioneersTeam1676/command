"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/lib/auth/current-user";
import { setAttending } from "@/lib/attend";
import { cancelEvent, createEvent, deleteEvent, eventFormSchema, updateEvent } from "@/lib/events";
import { parseForm, type FormState } from "@/lib/form";
import { uuidSchema } from "@/lib/validation";

const KEEP = ["title", "description", "locationText", "startsAt", "endsAt", "verification"];

/** The outreach box is only on the form while outreach tracking is on; otherwise leave the flag untouched. */
const withOutreach = <T extends { isOutreach: boolean }>(data: T, formData: FormData) => ({ ...data, isOutreach: formData.has("outreachShown") ? data.isOutreach : undefined });

export async function createEventAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireActionUser("lead");
  const parsed = parseForm(eventFormSchema, formData, { keepValues: KEEP });
  if (!parsed.ok) return parsed.state;
  const r = await createEvent(user.id, withOutreach(parsed.data, formData));
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
  const r = await updateEvent(user.id, id.data, withOutreach(parsed.data, formData));
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

const attendSchema = z.object({ eventId: uuidSchema, going: z.enum(["true", "false"]), note: z.string().max(300).optional() });

/** "I'm going" / "I can't make it" from the event page, with an optional note for leads. */
export async function attendAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireActionUser("member");
  const p = attendSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: "Something went wrong. Reload the page and try again." };
  const going = p.data.going === "true";
  const r = await setAttending({ id: user.id, role: user.role }, p.data.eventId, going, p.data.note);
  if (!r.ok) return { error: r.error };
  revalidatePath(`/calendar/${p.data.eventId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
  return { success: going ? "You're signed up. You can change this any time before the event ends." : "Okay, you're off the list." };
}

/** One-tap toggle from the Home screen. */
export async function attendQuickAction(formData: FormData): Promise<void> {
  const user = await requireActionUser("member");
  const p = attendSchema.omit({ note: true }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  await setAttending({ id: user.id, role: user.role }, p.data.eventId, p.data.going === "true");
  revalidatePath("/");
  revalidatePath("/calendar");
}

/** Permanent delete from the event page. Returns to the calendar on success; the page shows why when it's refused. */
export async function deleteEventAction(formData: FormData) {
  const user = await requireActionUser("admin");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const r = await deleteEvent(user.id, id.data);
  revalidatePath("/calendar");
  if (r.ok) redirect("/calendar");
  redirect(`/calendar/${id.data}?deleteError=${encodeURIComponent(r.error)}`);
}
