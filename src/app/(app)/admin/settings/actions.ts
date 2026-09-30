"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/lib/auth/current-user";
import { hit } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/audit";
import { checkNow } from "@/lib/registry";
import { isHexColor } from "@/lib/color";
import { MAX_LOGO_BYTES, saveLogo, sniffImage } from "@/lib/files";
import { parseForm, type FormState } from "@/lib/form";
import { isHHMM, parseDomains, updateTeamSettings, validateSchedule } from "@/lib/settings-admin";
import { smtpConfigured } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { readSettings } from "@/lib/settings";
import { buildAdminWelcome } from "@/lib/team-emails";
import { isValidTimezone } from "@/lib/setup";
import { optionalText } from "@/lib/validation";

const done = (fields: string[] | undefined): FormState => {
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { success: fields ? "Saved." : "Nothing changed." };
};

const teamSchema = z.object({
  name: z.string().trim().min(1, "Enter your team's name.").max(80),
  teamNumber: optionalText(20),
  region: optionalText(80),
  timezone: z.string().refine(isValidTimezone, "Choose a valid timezone."),
  accentColor: z.string().refine(isHexColor, "Pick a color."),
  domains: optionalText(2000),
});

export async function saveTeamAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const p = parseForm(teamSchema, formData, { keepValues: ["name", "teamNumber", "region", "timezone", "accentColor", "domains"] });
  if (!p.ok) return p.state;
  const d = parseDomains(p.data.domains ?? "");
  if (!d.ok) return { error: `"${d.bad}" doesn't look like a domain. Use something like school.edu.`, fieldErrors: { domains: `"${d.bad}" isn't a valid domain.` } };
  let logoPath: string | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > MAX_LOGO_BYTES) return { error: "Logo must be under 512 KB.", fieldErrors: { logo: "That file is too big (max 512 KB)." } };
    const buf = Buffer.from(await logo.arrayBuffer());
    const type = sniffImage(buf);
    if (!type) return { error: "Logo must be a PNG, JPEG or WebP image.", fieldErrors: { logo: "Use a PNG, JPEG or WebP image." } };
    logoPath = await saveLogo(buf, type.ext);
  }
  const removeLogo = formData.get("removeLogo") === "on";
  const r = await updateTeamSettings(
    admin.id,
    {
      name: p.data.name,
      teamNumber: p.data.teamNumber ?? null,
      region: p.data.region ?? null,
      timezone: p.data.timezone,
      accentColor: p.data.accentColor,
      allowedDomains: d.domains,
      ...(logoPath ? { logoPath } : removeLogo ? { logoPath: null } : {}),
    },
    "settings.team",
  );
  return done(r.changed ? r.fields : undefined);
}

const attendanceSchema = z.object({
  defaultCheckinVerification: z.enum(["none", "code"]),
  autoClockoutTime: z.string().refine(isHHMM, "Enter a time like 21:00."),
  eventAutocloseGraceMinutes: z.coerce.number().int().min(0, "Use 0 or more.").max(240, "Use 240 or fewer."),
});

export async function saveAttendanceAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const p = parseForm(attendanceSchema, formData, { keepValues: ["defaultCheckinVerification", "autoClockoutTime", "eventAutocloseGraceMinutes"] });
  if (!p.ok) return p.state;
  const current = await readSettings();
  const err = validateSchedule({ dailyReminderTime: current.dailyReminderTime.slice(0, 5), clockoutReminderTime: current.clockoutReminderTime.slice(0, 5), autoClockoutTime: p.data.autoClockoutTime });
  if (err) return { error: err, fieldErrors: { autoClockoutTime: err } };
  const r = await updateTeamSettings(
    admin.id,
    {
      defaultCheckinVerification: p.data.defaultCheckinVerification,
      backfillRequiresApproval: formData.get("backfillRequiresApproval") === "on",
      showOffHoursNotice: formData.get("showOffHoursNotice") === "on",
      clockoutNoteEnabled: formData.get("clockoutNoteEnabled") === "on",
      clockoutNoteRequired: formData.get("clockoutNoteRequired") === "on",
      autoClockoutTime: p.data.autoClockoutTime,
      eventAutocloseGraceMinutes: p.data.eventAutocloseGraceMinutes,
    },
    "settings.attendance",
  );
  return done(r.changed ? r.fields : undefined);
}

const remindersSchema = z.object({
  dailyReminderTime: z.string().refine(isHHMM, "Enter a time like 15:30."),
  clockoutReminderTime: z.string().refine(isHHMM, "Enter a time like 20:30."),
  eventReminderMinutesBefore: z.coerce.number().int().min(5, "Use 5 or more.").max(1440, "Use 1440 or fewer."),
});

export async function saveRemindersAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const p = parseForm(remindersSchema, formData, { keepValues: ["dailyReminderTime", "clockoutReminderTime", "eventReminderMinutesBefore"] });
  if (!p.ok) return p.state;
  const current = await readSettings();
  const err = validateSchedule({ dailyReminderTime: p.data.dailyReminderTime, clockoutReminderTime: p.data.clockoutReminderTime, autoClockoutTime: current.autoClockoutTime.slice(0, 5) });
  if (err) return { error: err, fieldErrors: { clockoutReminderTime: err } };
  const r = await updateTeamSettings(admin.id, p.data, "settings.reminders");
  return done(r.changed ? r.fields : undefined);
}


const emailsSchema = z.object({ emailNote: optionalText(300) });

export async function saveEmailsAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  const p = parseForm(emailsSchema, formData, { keepValues: ["emailNote"] });
  if (!p.ok) return p.state;
  const r = await updateTeamSettings(
    admin.id,
    {
      emailAdminPromoted: formData.get("emailAdminPromoted") === "on",
      emailAccessApproved: formData.get("emailAccessApproved") === "on",
      emailAccessDenied: formData.get("emailAccessDenied") === "on",
      emailNote: p.data.emailNote ?? null,
    },
    "settings.emails",
  );
  return done(r.changed ? r.fields : undefined);
}

/** Send the branded admin email to the person clicking, using the saved settings. */
export async function sendEmailPreviewAction(_: FormState, __: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin");
  if (!smtpConfigured()) return { error: "Email isn't set up on this server yet." };
  const mail = await buildAdminWelcome(await readSettings(), admin, admin.name);
  const r = await sendMail(admin.email, mail.subject, mail.text, mail.html, mail.attachments);
  return r.sent ? { success: `Preview sent to ${admin.email}.` } : { error: `Couldn't send: ${r.error}` };
}

/** "Check now": send a license-check heartbeat immediately and report what came back. */
export async function checkRegistryNowAction(_: FormState, __: FormData): Promise<FormState> {
  const admin = await requireActionUser("admin", { allowReadOnly: true });
  if (!(await hit(`registry-check:${admin.id}`, 6, 600)).allowed) return { error: "Too many checks. Wait a few minutes." };
  const state = await checkNow();
  await audit({ actorId: admin.id, action: "registry.check_now", targetType: "registry", after: { state: state.state } });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return state.state === "ok" || state.state === "revoked" ? { success: state.state === "ok" ? "Checked in with the license registry. All good." : "Checked in. The owner has revoked this installation: see the notice at the top." } : { error: "Couldn't complete a check-in yet. The notice at the top explains what to do." };
}
