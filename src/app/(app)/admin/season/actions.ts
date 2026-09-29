"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/lib/auth/current-user";
import { parseForm, type FormState } from "@/lib/form";
import { updateCurrentSeason } from "@/lib/seasons";

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
