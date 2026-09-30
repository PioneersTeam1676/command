"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/lib/auth/current-user";
import { parseForm, type FormState } from "@/lib/form";
import { addSlot, cancelSlot, claimSlot, createSheet, leaveSlot, setSheetClosed, slotFormSchema, updateSlot } from "@/lib/signups";
import { uuidSchema } from "@/lib/validation";

const KEEP = ["title", "description", "startsAt", "endsAt", "capacity", "audience", "opensToAllAt"];
const groupIdsSchema = z.array(uuidSchema).max(20);
const groupIdsOf = (fd: FormData) => groupIdsSchema.safeParse(fd.getAll("groupIds").filter((v): v is string => typeof v === "string"));

function refresh(eventId: string) {
  revalidatePath(`/calendar/${eventId}`);
  revalidatePath(`/parent/calendar/${eventId}`);
  revalidatePath("/signups");
}
const keptValues = (fd: FormData) => Object.fromEntries(KEEP.map((k) => [k, String(fd.get(k) ?? "")]));

// ---------- Anyone who can see the sheet (members, leads, admins, approved parents) ----------

export async function claimSlotAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireActionUser("member", { allowParent: true });
  const slotId = uuidSchema.safeParse(fd.get("slotId"));
  const eventId = uuidSchema.safeParse(fd.get("eventId"));
  if (!slotId.success || !eventId.success) return { error: "Unknown shift." };
  const r = await claimSlot({ id: user.id, role: user.role }, slotId.data);
  refresh(eventId.data);
  if (!r.ok) return { error: r.error };
  return { success: r.status === "waitlisted" ? `This shift is full, so you're number ${r.position} on the waitlist. We'll let you know if a place opens.` : "You're signed up." };
}

export async function leaveSlotAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireActionUser("member", { allowParent: true });
  const slotId = uuidSchema.safeParse(fd.get("slotId"));
  const eventId = uuidSchema.safeParse(fd.get("eventId"));
  if (!slotId.success || !eventId.success) return { error: "Unknown shift." };
  const r = await leaveSlot({ id: user.id, role: user.role }, slotId.data);
  refresh(eventId.data);
  return r.ok ? { success: "Done. You're no longer on this shift." } : { error: r.error };
}

// ---------- Leads and admins ----------

export async function createSheetAction(formData: FormData) {
  const user = await requireActionUser("lead");
  const eventId = uuidSchema.safeParse(formData.get("eventId"));
  if (!eventId.success) return;
  await createSheet(user.id, eventId.data);
  refresh(eventId.data);
}

export async function toggleSheetAction(formData: FormData) {
  const user = await requireActionUser("lead");
  const sheetId = uuidSchema.safeParse(formData.get("sheetId"));
  const eventId = uuidSchema.safeParse(formData.get("eventId"));
  if (!sheetId.success || !eventId.success) return;
  await setSheetClosed(user.id, sheetId.data, formData.get("closed") === "true");
  refresh(eventId.data);
}

export async function addSlotAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireActionUser("lead");
  const sheetId = uuidSchema.safeParse(fd.get("sheetId"));
  const eventId = uuidSchema.safeParse(fd.get("eventId"));
  if (!sheetId.success || !eventId.success) return { error: "Unknown sign-up sheet." };
  const parsed = parseForm(slotFormSchema, fd, { keepValues: KEEP });
  if (!parsed.ok) return parsed.state;
  const groupIds = groupIdsOf(fd);
  if (!groupIds.success) return { error: "Pick groups from the list." };
  const r = await addSlot(user.id, sheetId.data, { ...parsed.data, groupIds: groupIds.data });
  if (!r.ok) return { error: r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined, values: keptValues(fd) };
  refresh(eventId.data);
  return { success: "Shift added." };
}

export async function updateSlotAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireActionUser("lead");
  const slotId = uuidSchema.safeParse(fd.get("slotId"));
  const eventId = uuidSchema.safeParse(fd.get("eventId"));
  if (!slotId.success || !eventId.success) return { error: "Unknown shift." };
  const parsed = parseForm(slotFormSchema, fd, { keepValues: KEEP });
  if (!parsed.ok) return parsed.state;
  const groupIds = groupIdsOf(fd);
  if (!groupIds.success) return { error: "Pick groups from the list." };
  const r = await updateSlot(user.id, slotId.data, { ...parsed.data, groupIds: groupIds.data });
  if (!r.ok) return { error: r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined, values: keptValues(fd) };
  refresh(eventId.data);
  return { success: "Saved." };
}

export async function cancelSlotAction(formData: FormData) {
  const user = await requireActionUser("lead");
  const slotId = uuidSchema.safeParse(formData.get("slotId"));
  const eventId = uuidSchema.safeParse(formData.get("eventId"));
  if (!slotId.success || !eventId.success) return;
  await cancelSlot(user.id, slotId.data);
  refresh(eventId.data);
}
