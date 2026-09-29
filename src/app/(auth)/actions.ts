"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  findUserByEmail,
  registerPasswordUser,
  requestPasswordReset,
  resetPasswordWithToken,
  sendVerificationEmail,
  statusGate,
  verifyEmailToken,
} from "@/lib/accounts";
import { audit } from "@/lib/audit";
import { hashPassword, burnPasswordTime, verifyPassword } from "@/lib/auth/password";
import { hit, reset } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/request";
import { destroyAllSessions, destroyCurrentSession, createSession } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/current-user";
import { smtpConfigured } from "@/lib/env";
import { parseForm, safeNext, type FormState } from "@/lib/form";
import { emailSchema, nameSchema, optionalText, passwordSchema } from "@/lib/validation";

const GENERIC_LOGIN_ERROR = "That email and password don't match. Check them and try again.";
const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.").max(200), next: z.string().optional() });

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(loginSchema, formData, { keepValues: ["email"] });
  if (!parsed.ok) return parsed.state;
  const { email, password, next } = parsed.data;

  const ip = await clientIp();
  const [byIp, byAccount] = await Promise.all([hit(`login:ip:${ip}`, 30, 600), hit(`login:acct:${email}`, 8, 900)]);
  if (!byIp.allowed || !byAccount.allowed) return { error: TOO_MANY, values: { email } };

  const user = await findUserByEmail(email);
  if (!user?.passwordHash) {
    await burnPasswordTime(password);
    return { error: GENERIC_LOGIN_ERROR, values: { email } };
  }
  if (!(await verifyPassword(user.passwordHash, password))) return { error: GENERIC_LOGIN_ERROR, values: { email } };

  const gate = await statusGate(user);
  if (!gate.ok) return { error: gate.error, values: { email } };

  await reset(`login:acct:${email}`);
  await createSession(user.id);
  redirect(safeNext(next));
}

const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  note: optionalText(500),
});

export async function signupAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(signupSchema, formData, { keepValues: ["name", "email", "note"] });
  if (!parsed.ok) return parsed.state;
  const ip = await clientIp();
  if (!(await hit(`signup:ip:${ip}`, 10, 3600)).allowed) return { error: TOO_MANY };

  const result = await registerPasswordUser(parsed.data);
  if (!result.ok) return { error: result.error, values: { name: parsed.data.name, email: parsed.data.email, note: parsed.data.note ?? "" } };
  await createSession(result.userId);
  redirect("/waiting");
}

export async function logoutAction() {
  await destroyCurrentSession();
  redirect("/login");
}

const forgotSchema = z.object({ email: emailSchema });

export async function forgotPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(forgotSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ip = await clientIp();
  const [a, b] = await Promise.all([hit(`reset:ip:${ip}`, 5, 3600), hit(`reset:acct:${parsed.data.email}`, 3, 3600)]);
  if (!a.allowed || !b.allowed) return { error: TOO_MANY };
  await requestPasswordReset(parsed.data.email);
  return { success: "If that email has an account, we've sent a reset link. It works once and expires in 1 hour." };
}

const resetSchema = z
  .object({ token: z.string().min(10).max(200), password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match.", path: ["confirm"] });

export async function resetPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(resetSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ip = await clientIp();
  if (!(await hit(`reset-use:ip:${ip}`, 20, 3600)).allowed) return { error: TOO_MANY };
  const r = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
  if (!r.ok) return { error: "This reset link has expired or was already used. Ask for a new one." };
  redirect("/login?reset=1");
}

const changeSchema = z
  .object({ current: z.string().min(1, "Enter your current password.").max(200), password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match.", path: ["confirm"] })
  .refine((v) => v.password !== v.current, { message: "Choose a password you haven't used just now.", path: ["password"] });

export async function changePasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = parseForm(changeSchema, formData);
  if (!parsed.ok) return parsed.state;
  if (!(await hit(`chpw:${user.id}`, 10, 900)).allowed) return { error: TOO_MANY };
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, parsed.data.current))) {
    return { error: "Your current password isn't right.", fieldErrors: { current: "That isn't your current password." } };
  }
  await db.update(users).set({ passwordHash: await hashPassword(parsed.data.password), mustChangePassword: false }).where(eq(users.id, user.id));
  await destroyAllSessions(user.id, true);
  await audit({ actorId: user.id, action: "user.change_password", targetType: "user", targetId: user.id });
  redirect("/");
}

export async function confirmEmailAction(_: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const r = await verifyEmailToken(token);
  if (!r.ok) return { error: "This confirmation link has expired or was already used. Sign in and ask for a new one." };
  redirect(r.status === "active" ? "/?welcome=1" : "/waiting");
}

export async function resendVerificationAction(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!smtpConfigured()) return { error: "Email isn't set up for this team." };
  if (user.emailVerifiedAt) return { success: "Your email is already confirmed." };
  if (!(await hit(`verify-resend:${user.id}`, 3, 3600)).allowed) return { error: TOO_MANY };
  const r = await sendVerificationEmail(user);
  return r.sent ? { success: "We sent a new confirmation link." } : { error: "We couldn't send the email. Try again later." };
}
