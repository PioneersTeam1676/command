"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { markAllRead, saveAttendingDays, setPref } from "@/lib/notification-prefs";
import { getCurrentSeason } from "@/lib/seasons";
import type { FormState } from "@/lib/form";

async function user() {
  const u = await getCurrentUser();
  if (!u || u.status !== "active") throw new Error("Please sign in again.");
  return u;
}

export async function setPrefAction(type: string, enabled: boolean): Promise<{ ok: boolean }> {
  const u = await user();
  const ok = await setPref(u.id, z.string().max(60).parse(type), Boolean(enabled));
  revalidatePath("/me/notifications");
  return { ok };
}

export async function saveDaysAction(_: FormState, formData: FormData): Promise<FormState> {
  const u = await user();
  const season = await getCurrentSeason();
  const picked = formData.getAll("days").map(Number).filter((d) => Number.isInteger(d));
  if (picked.length === 0) return { error: "Pick at least one day, or turn the reminder off above." };
  await saveAttendingDays(u.id, season.workdays, picked);
  revalidatePath("/me/notifications");
  return { success: "Saved. Reminders will only come on those days." };
}

export async function markAllReadAction() {
  const u = await user();
  await markAllRead(u.id);
  revalidatePath("/me/notifications");
}
