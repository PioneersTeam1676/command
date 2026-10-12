"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { findUserByEmail, normalizeEmail } from "@/lib/accounts";
import { hashPassword } from "@/lib/auth/password";
import { hit } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/request";
import { createSession } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/current-user";
import { parseForm, type FormState } from "@/lib/form";
import { RELATIONSHIPS, resolveInvite, submitParentLink } from "@/lib/parents";
import { emailSchema, nameSchema, optionalText, passwordSchema } from "@/lib/validation";

const tokenField = z.string().min(10).max(200);

const signupSchema = z.object({ token: tokenField, name: nameSchema, email: emailSchema, password: passwordSchema });

/** Parent accounts may use any email domain. Their access is gated by admin approval of the link, not the address. */
export async function parentSignupAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(signupSchema, formData, { keepValues: ["name", "email"] });
  if (!parsed.ok) return parsed.state;
  const { token, name, email, password } = parsed.data;
  if (!(await hit(`signup:ip:${await clientIp()}`, 10, 3600)).allowed) return { error: "Too many attempts. Please wait a few minutes." };
  if (!(await resolveInvite(token))) return { error: "This invite link has expired or was revoked. Ask the student for a new one." };
  if (await findUserByEmail(email)) return { error: "An account with that email already exists. Sign in instead.", values: { name, email } };
  const [user] = await db
    .insert(users)
    .values({ email: normalizeEmail(email), name, role: "parent", status: "active", passwordHash: await hashPassword(password) })
    .returning();
  await createSession(user!.id);
  redirect(`/invite/parent/${token}`);
}

const detailsSchema = z.object({
  token: tokenField,
  fullName: nameSchema,
  relationship: z.enum(RELATIONSHIPS, { message: "Choose your relationship to the student." }),
  phone: optionalText(30),
  note: optionalText(500),
});

export async function submitParentDetailsAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "parent" || user.status !== "active") redirect("/login");
  const parsed = parseForm(detailsSchema, formData, { keepValues: ["fullName", "relationship", "phone", "note"] });
  if (!parsed.ok) return parsed.state;
  if (!(await hit(`parent-details:${user.id}`, 10, 3600)).allowed) return { error: "Too many attempts. Please wait a few minutes." };
  const { token, ...details } = parsed.data;
  const r = await submitParentLink(user.id, token, details);
  if (!r.ok) return { error: r.error };
  redirect("/parent");
}

/** Re-submit after the team asked for more information. */
export async function resubmitParentLinkAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "parent" || user.status !== "active") redirect("/login");
  const parsed = parseForm(
    z.object({ linkId: z.string().uuid(), fullName: nameSchema, relationship: z.enum(RELATIONSHIPS), phone: optionalText(30), note: optionalText(500) }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const { resubmitParentLink } = await import("@/lib/parents-resubmit");
  const r = await resubmitParentLink(user.id, parsed.data);
  return r.ok ? { success: "Sent. We'll let you know when the team has reviewed it." } : { error: r.error };
}
