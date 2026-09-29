"use server";

import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teamSettings, users } from "@/db/schema";
import { findUserByEmail, normalizeEmail } from "@/lib/accounts";
import { audit } from "@/lib/audit";
import { normalizeDomain } from "@/lib/auth/approval";
import { hashPassword, verifyPassword, burnPasswordTime } from "@/lib/auth/password";
import { hit } from "@/lib/auth/rate-limit";
import { clientIp, isSecureDeployment } from "@/lib/auth/request";
import { createSession } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isHexColor } from "@/lib/color";
import { smtpConfigured } from "@/lib/env";
import { MAX_LOGO_BYTES, saveLogo, sniffImage } from "@/lib/files";
import { parseForm, type FormState } from "@/lib/form";
import { testSmtp } from "@/lib/mail";
import { readSettings } from "@/lib/settings";
import { adminExists, completeSetup, ensureSecrets, isValidTimezone, verifySetupToken } from "@/lib/setup";
import { emailSchema, nameSchema, optionalText, passwordSchema } from "@/lib/validation";

const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";

/** Every setup action starts here: setup must be open and the ticket cookie must hold a valid token. */
async function guard() {
  const settings = await readSettings();
  if (settings.setupCompletedAt) notFound();
  const ticket = (await cookies()).get("cmd_setup")?.value;
  if (!ticket || !(await verifySetupToken(ticket))) redirect("/setup");
}

async function setupAdmin() {
  await guard();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || user.status !== "active") redirect("/setup?step=account");
  return user;
}

export async function submitTokenAction(_: FormState, formData: FormData): Promise<FormState> {
  const settings = await readSettings();
  if (settings.setupCompletedAt) notFound();
  const token = String(formData.get("token") ?? "").trim();
  if (!(await hit(`setup-token:${await clientIp()}`, 10, 900)).allowed) return { error: TOO_MANY };
  if (!token || !(await verifySetupToken(token))) {
    return { error: "That token isn't right. Copy it exactly from the app's logs (run `docker compose logs app`)." };
  }
  await ensureSecrets();
  (await cookies()).set("cmd_setup", token, { httpOnly: true, secure: isSecureDeployment(), sameSite: "lax", path: "/", maxAge: 3600 });
  redirect("/setup?step=account");
}

const accountSchema = z
  .object({ name: nameSchema, email: emailSchema, password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match.", path: ["confirm"] });

export async function createAdminAction(_: FormState, formData: FormData): Promise<FormState> {
  await guard();
  if (await adminExists()) return { error: "An admin account already exists. Sign in below to continue." };
  const parsed = parseForm(accountSchema, formData, { keepValues: ["name", "email"] });
  if (!parsed.ok) return parsed.state;
  const email = normalizeEmail(parsed.data.email);
  if (await findUserByEmail(email)) return { error: "That email is already in use." };
  const [admin] = await db
    .insert(users)
    .values({ email, name: parsed.data.name, role: "admin", status: "active", passwordHash: await hashPassword(parsed.data.password), emailVerifiedAt: new Date() })
    .returning();
  await createSession(admin!.id);
  redirect("/setup?step=team");
}

const resumeSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

/** Sign back in as the admin created earlier in this setup (e.g. after closing the browser). */
export async function resumeAdminAction(_: FormState, formData: FormData): Promise<FormState> {
  await guard();
  const parsed = parseForm(resumeSchema, formData, { keepValues: ["email"] });
  if (!parsed.ok) return parsed.state;
  if (!(await hit(`setup-resume:${await clientIp()}`, 10, 900)).allowed) return { error: TOO_MANY };
  const user = await findUserByEmail(parsed.data.email);
  if (!user?.passwordHash || user.role !== "admin") {
    await burnPasswordTime(parsed.data.password);
    return { error: "That email and password don't match.", values: { email: parsed.data.email } };
  }
  if (!(await verifyPassword(user.passwordHash, parsed.data.password))) return { error: "That email and password don't match.", values: { email: parsed.data.email } };
  await createSession(user.id);
  redirect("/setup?step=team");
}

const teamSchema = z.object({
  name: z.string().trim().min(1, "Enter your team's name.").max(80),
  teamNumber: optionalText(20),
  region: optionalText(80),
  timezone: z.string().refine(isValidTimezone, "Choose a valid timezone."),
  domains: optionalText(2000),
  accentColor: z.string().refine(isHexColor, "Pick a color."),
});

export async function saveTeamAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await setupAdmin();
  const parsed = parseForm(teamSchema, formData, { keepValues: ["name", "teamNumber", "region", "timezone", "domains", "accentColor"] });
  if (!parsed.ok) return parsed.state;
  const domains: string[] = [];
  for (const raw of (parsed.data.domains ?? "").split(/[\s,;]+/).filter(Boolean)) {
    const d = normalizeDomain(raw);
    if (!d) return { error: `"${raw}" doesn't look like a domain. Use something like school.edu.`, fieldErrors: { domains: `"${raw}" isn't a valid domain.` }, values: { ...Object.fromEntries(formData.entries() as Iterable<[string, string]>) } };
    if (!domains.includes(d)) domains.push(d);
  }
  let logoPath: string | null | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > MAX_LOGO_BYTES) return { error: "Logo must be under 512 KB.", fieldErrors: { logo: "That file is too big (max 512 KB)." } };
    const buf = Buffer.from(await logo.arrayBuffer());
    const type = sniffImage(buf);
    if (!type) return { error: "Logo must be a PNG, JPEG or WebP image.", fieldErrors: { logo: "Use a PNG, JPEG or WebP image." } };
    logoPath = await saveLogo(buf, type.ext);
  }
  await db
    .update(teamSettings)
    .set({
      name: parsed.data.name,
      teamNumber: parsed.data.teamNumber ?? null,
      region: parsed.data.region ?? null,
      timezone: parsed.data.timezone,
      allowedDomains: domains,
      accentColor: parsed.data.accentColor,
      ...(logoPath ? { logoPath } : {}),
    })
    .where(eq(teamSettings.id, 1));
  await audit({ actorId: admin.id, action: "setup.team_saved", targetType: "team" });
  redirect(smtpConfigured() ? "/setup?step=email" : "/setup?step=finish");
}

export async function testEmailAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await setupAdmin();
  if (!smtpConfigured()) return { error: "Email isn't configured. Skip this step." };
  if (!(await hit(`setup-smtp:${admin.id}`, 5, 900)).allowed) return { error: TOO_MANY };
  const to = emailSchema.safeParse(formData.get("to"));
  if (!to.success) return { error: "Enter a valid email address to send the test to." };
  const r = await testSmtp(to.data);
  return r.sent ? { success: `Sent. Check ${to.data} (and its spam folder).` } : { error: `The test email failed: ${r.error}` };
}

export async function finishSetupAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await setupAdmin();
  if (formData.get("agree") !== "on") return { error: "Please confirm you've read the license and the registry notice." };
  await completeSetup(admin.id);
  const { registerAtSetup } = await import("@/lib/registry");
  await registerAtSetup();
  redirect("/?welcome=1");
}
