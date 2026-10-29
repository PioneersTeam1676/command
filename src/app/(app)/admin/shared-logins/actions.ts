"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { requireActionUser } from "@/lib/auth/current-user";
import type { FormState } from "@/lib/form";
import { createLogin, createLoginSchema, deleteLogin, updateLogin, updateLoginSchema } from "@/lib/shared-logins";
import { uuidSchema } from "@/lib/validation";

const refresh = () => {
  revalidatePath("/admin/shared-logins");
  revalidatePath("/logins");
  revalidatePath("/", "layout"); // the navigation shows Logins only to people who can use one
};

/** Passwords and secrets are never echoed back; only the plain fields are kept after a failed save. */
function read(fd: FormData) {
  const s = (k: string) => String(fd.get(k) ?? "");
  return { label: s("label"), email: s("email"), password: s("password"), totpSecret: s("totpSecret"), groupIds: fd.getAll("groupIds").map(String) };
}
const keep = (raw: ReturnType<typeof read>) => ({ label: raw.label, email: raw.email });

function invalid(error: z.ZodError, raw: ReturnType<typeof read>): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const i of error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
  return { error: "Please fix the highlighted fields.", fieldErrors, values: keep(raw) };
}

export async function createLoginAction(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const raw = read(fd);
  const parsed = createLoginSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error, raw);
  const r = await createLogin(admin.id, parsed.data);
  if (!r.ok) return { error: r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined, values: keep(raw) };
  refresh();
  return { success: "Added. People in those groups can use it now." };
}

export async function updateLoginAction(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const id = uuidSchema.safeParse(fd.get("id"));
  if (!id.success) return { error: "Unknown login." };
  const raw = read(fd);
  const parsed = updateLoginSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error, raw);
  const r = await updateLogin(admin.id, id.data, parsed.data);
  if (!r.ok) return { error: r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined, values: keep(raw) };
  refresh();
  return { success: "Saved." };
}

export async function deleteLoginAction(fd: FormData) {
  const admin = await requireActionUser("admin");
  const id = uuidSchema.safeParse(fd.get("id"));
  if (!id.success) return;
  const r = await deleteLogin(admin.id, id.data);
  refresh();
  if (!r.ok) redirect(`/admin/shared-logins?error=${encodeURIComponent(r.error)}`);
}
