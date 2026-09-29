"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionUser } from "@/lib/auth/current-user";
import { parseForm, type FormState } from "@/lib/form";
import { startNewSeason, updateCurrentSeason } from "@/lib/seasons";

const schema = z.object({
  name: z.string().trim().min(1, "Give the season a name.").max(80),
  buildStart: z.string().optional().transform((v) => v || null),
  buildEnd: z.string().optional().transform((v) => v || null),
});

export async function saveSeasonAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const parsed = parseForm(schema, formData, { keepValues: ["name", "buildStart", "buildEnd"] });
  if (!parsed.ok) return parsed.state;
  const workdays = formData.getAll("workdays").map((v) => Number(v));
  const r = await updateCurrentSeason(admin.id, { ...parsed.data, workdays });
  if (!r.ok) return { error: r.error };
  revalidatePath("/calendar");
  revalidatePath("/admin/season");
  return { success: "Saved." };
}


const newSeasonSchema = z.object({
  name: z.string().trim().min(1, "Give the new season a name.").max(80),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
  buildStart: z.string().optional().transform((v) => v || null),
  buildEnd: z.string().optional().transform((v) => v || null),
});

export async function startSeasonAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const p = parseForm(newSeasonSchema, formData, { keepValues: ["name", "startDate", "buildStart", "buildEnd"] });
  if (!p.ok) return p.state;
  if (formData.get("confirm") !== "on") return { error: "Tick the box to confirm you understand what happens.", values: { name: p.data.name, startDate: p.data.startDate, buildStart: p.data.buildStart ?? "", buildEnd: p.data.buildEnd ?? "" } };
  const workdays = formData.getAll("workdays").map((v) => Number(v));
  const r = await startNewSeason(admin.id, { ...p.data, workdays: workdays.length ? workdays : [1, 2, 3, 4, 5] });
  if (!r.ok) return { error: r.error, values: { name: p.data.name, startDate: p.data.startDate, buildStart: p.data.buildStart ?? "", buildEnd: p.data.buildEnd ?? "" } };
  revalidatePath("/", "layout");
  redirect("/admin/season?started=1");
}
