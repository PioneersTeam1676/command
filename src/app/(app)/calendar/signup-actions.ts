"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/lib/auth/current-user";
import { parseForm, type FormState } from "@/lib/form";
import { assignGroup, assignPeople, notifyFirstPickById, nudgeSheet, removeEntry } from "@/lib/signup-admin";
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
  await notifyFirstPickById(r.id).catch(() => undefined);
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

// ---------- Managing who's on a shift (leads and admins) ----------

const summarise = (assigned: number, skipped: { name: string; reason: string }[]) => {
  const head = assigned === 0 ? "Nobody was added." : `Added ${assigned} ${assigned === 1 ? "person" : "people"}.`;
  return skipped.length === 0 ? head : `${head} Skipped: ${skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}.`;
};

export async function assignPeopleAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireActionUser("lead");
  const p = z.object({ slotId: uuidSchema, eventId: uuidSchema, userIds: z.array(uuidSchema).max(500) }).safeParse({ slotId: fd.get("slotId"), eventId: fd.get("eventId"), userIds: fd.getAll("userIds") });
  if (!p.success) return { error: "Tick at least one person." };
  if (p.data.userIds.length === 0) return { error: "Tick at least one person." };
  const r = await assignPeople(user.id, p.data.slotId, p.data.userIds, { overbook: fd.get("overbook") === "on" });
  refresh(p.data.eventId);
  return r.ok ? { success: summarise(r.assigned, r.skipped) } : { error: r.error };
}

export async function assignGroupAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireActionUser("lead");
  const p = z.object({ slotId: uuidSchema, eventId: uuidSchema, groupId: uuidSchema }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Choose a group." };
  const r = await assignGroup(user.id, p.data.slotId, p.data.groupId, { overbook: fd.get("overbook") === "on" });
  refresh(p.data.eventId);
  return r.ok ? { success: summarise(r.assigned, r.skipped) } : { error: r.error };
}

export async function removeEntryAction(formData: FormData) {
  const user = await requireActionUser("lead");
  const p = z.object({ entryId: uuidSchema, eventId: uuidSchema }).safeParse(Object.fromEntries(formData));
  if (!p.success) return;
  await removeEntry(user.id, p.data.entryId);
  refresh(p.data.eventId);
}

export async function nudgeAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireActionUser("lead");
  const p = z.object({ sheetId: uuidSchema, eventId: uuidSchema }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Unknown sign-up sheet." };
  const r = await nudgeSheet(user.id, p.data.sheetId);
  if (!r.ok) return { error: r.error };
  if (r.alreadyToday) return { success: "Everyone who hasn't signed up was already reminded today. Try again tomorrow." };
  return { success: r.reminded === 0 ? "Everyone who can sign up already has." : `Reminded ${r.reminded} ${r.reminded === 1 ? "person" : "people"}.` };
}
