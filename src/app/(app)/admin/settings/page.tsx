import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/form";
import { SelectField, TextField } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { getEnv, googleAuthEnabled, smtpConfigured } from "@/lib/env";
import { readSettings } from "@/lib/settings";
import { GcalCard } from "@/components/gcal-card";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { parseServiceAccount } from "@/lib/gcal/api";
import { LicenseCard } from "@/components/registry/license-card";
import { registryOverview } from "@/lib/registry";
import { checkRegistryNowAction, saveAttendanceAction, saveEmailsAction, saveRemindersAction, sendEmailPreviewAction, saveTeamAction } from "./actions";
import { importPastAction, saveIcsUrlAction, syncNowAction, testConnectionAction } from "./gcal-actions";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

function timezones(): string[] {
  try {
    const list = Intl.supportedValuesOf("timeZone");
    return list.includes("UTC") ? list : ["UTC", ...list];
  } catch {
    return ["UTC"];
  }
}

function Status({ on, label, help }: { on: boolean; label: string; help: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm md:text-[13px] text-muted">{help}</p>
      </div>
      <Badge tone={on ? "success" : "neutral"}>{on ? "On" : "Off"}</Badge>
    </div>
  );
}

export default async function SettingsPage() {
  await requireUser({ min: "admin" });
  const s = await readSettings();
  const env = getEnv();
  const sa = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const license = await registryOverview();
  const [failing] = await db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(and(eq(jobs.kind, "gcal.push"), isNull(jobs.doneAt), isNotNull(jobs.lastError)));
  const icsSaved = s.googleIcsUrl ? `…${s.googleIcsUrl.slice(-8)}` : null;
  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>How your team appears to members, and who gets in without waiting for approval.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveTeamAction} className="space-y-4">
            <TextField name="name" label="Team name" defaultValue={s.name} required maxLength={80} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="teamNumber" label="Team number (optional)" defaultValue={s.teamNumber ?? ""} maxLength={20} />
              <TextField name="region" label="Region (optional)" defaultValue={s.region ?? ""} maxLength={80} />
            </div>
            <SelectField name="timezone" label="Team timezone" options={timezones()} defaultValue={s.timezone} help="Schedules, reminders and “today” use this timezone. Changing it doesn't move existing events in time." />
            <TextField name="accentColor" label="Accent color" type="color" defaultValue={s.accentColor} className="[&_input]:h-11 [&_input]:p-1" help="Used for buttons and highlights. If it would be hard to read, we adjust it automatically." />
            <TextField name="logo" label="Logo" type="file" accept="image/png,image/jpeg,image/webp" help={s.logoPath ? "Choose a file to replace the current logo (PNG, JPEG or WebP, up to 512 KB)." : "PNG, JPEG or WebP, up to 512 KB. Also becomes your app icon."} />
            {s.logoPath ? (
              <label className="flex min-h-[44px] items-center gap-3 text-sm">
                <input type="checkbox" name="removeLogo" className="size-4 accent-[var(--accent)]" /> Remove the current logo
              </label>
            ) : null}
            <TextField name="domains" label="Auto-approved email domains" defaultValue={s.allowedDomains.join(", ")} placeholder="school.edu, team.org" help="People who sign in with Google using a verified email on one of these domains skip approval. Email must match exactly (no subdomains). Separate with commas." />
            <SubmitButton pendingText="Saving…">Save team settings</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clocking in and out</CardTitle>
          <CardDescription>Rules for attendance.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveAttendanceAction} className="space-y-4">
            <SelectField
              name="defaultCheckinVerification"
              label="Default event check-in"
              defaultValue={s.defaultCheckinVerification}
              options={[
                { value: "none", label: "One tap (no code)" },
                { value: "code", label: "Rotating code shown on a screen" },
              ]}
              help="Each event can override this. A rotating code proves someone is at the event."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="autoClockoutTime" label="Automatic clock-out time" type="time" defaultValue={s.autoClockoutTime.slice(0, 5)} required help="Anyone still clocked in is clocked out then, and flagged for a lead to check." />
              <TextField name="eventAutocloseGraceMinutes" label="Event grace period (minutes)" type="number" min={0} max={240} defaultValue={s.eventAutocloseGraceMinutes} help="How long after an event ends before people still checked in are clocked out." />
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="backfillRequiresApproval" defaultChecked={s.backfillRequiresApproval} className="mt-1 size-4 accent-[var(--accent)]" />
              <span>
                <span className="font-medium">Require approval for added time</span>
                <span className="block text-sm md:text-[13px] text-muted">When someone adds time they forgot to clock, a lead or admin must approve it before it counts. If you turn this off, it counts right away and is marked “self-reported”.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="showOffHoursNotice" defaultChecked={s.showOffHoursNotice} className="mt-1 size-4 accent-[var(--accent)]" />
              <span>
                <span className="font-medium">Show an “outside build hours” notice</span>
                <span className="block text-sm md:text-[13px] text-muted">On the Home screen, warn people when they clock in outside build season or after the automatic clock-out time that a lead will have to approve the time. The time is held for approval either way.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="clockoutNoteEnabled" defaultChecked={s.clockoutNoteEnabled} className="mt-1 size-4 accent-[var(--accent)]" />
              <span>
                <span className="font-medium">Ask what people did when they clock out</span>
                <span className="block text-sm md:text-[13px] text-muted">Shows a short note box before clocking out. The note is saved with the session and leads can see it.</span>
              </span>
            </label>
            <label className="ml-7 flex items-start gap-3 text-sm">
              <input type="checkbox" name="clockoutNoteRequired" defaultChecked={s.clockoutNoteRequired} className="mt-1 size-4 accent-[var(--accent)]" />
              <span>
                <span className="font-medium">Make the note required</span>
                <span className="block text-sm md:text-[13px] text-muted">People can&apos;t clock out until they write something. Only applies when the note is turned on.</span>
              </span>
            </label>
            <SubmitButton pendingText="Saving…">Save</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminder times</CardTitle>
          <CardDescription>When notifications go out. Reminders only happen on build season workdays (set on the Season tab). Members choose which types they want.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveRemindersAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="dailyReminderTime" label="Clock-in reminder" type="time" defaultValue={s.dailyReminderTime.slice(0, 5)} required help="Sent only to people who haven't clocked in." />
              <TextField name="clockoutReminderTime" label="Clock-out reminder" type="time" defaultValue={s.clockoutReminderTime.slice(0, 5)} required help="Sent only to people still clocked in." />
            </div>
            <TextField name="eventReminderMinutesBefore" label="Event reminder (minutes before)" type="number" min={5} max={1440} defaultValue={s.eventReminderMinutesBefore} help="Sent to people who said Going or Maybe." />
            <SubmitButton pendingText="Saving…">Save reminder times</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emails</CardTitle>
          <CardDescription>
            Which emails Command sends. They use your team name, color and logo from above. Sign-up confirmation and password reset emails always go out.
            {!smtpConfigured() ? " Email isn't set up on this server yet, so none of these will send." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveEmailsAction} className="space-y-4">
            {(
              [
                ["emailAdminPromoted", s.emailAdminPromoted, "Welcome email for new admins", "Sent when someone is made an admin."],
                ["emailAccessApproved", s.emailAccessApproved, "Access approved", "Sent when someone's request to join is approved (only if they have no push notifications set up)."],
                ["emailAccessDenied", s.emailAccessDenied, "Access denied", "Sent when someone's request to join is denied."],
              ] as const
            ).map(([name, on, label, help]) => (
              <label key={name} className="flex items-start gap-3 text-sm">
                <input type="checkbox" name={name} defaultChecked={on} className="mt-1 size-4 accent-[var(--accent)]" />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-sm md:text-[13px] text-muted">{help}</span>
                </span>
              </label>
            ))}
            <TextField name="emailNote" label="Personal note (optional)" defaultValue={s.emailNote ?? ""} maxLength={300} help="Added to the welcome email for new admins, e.g. “Come find us in the shop on Tuesday!”" />
            <SubmitButton pendingText="Saving…">Save email settings</SubmitButton>
          </ActionForm>
          <ActionForm action={sendEmailPreviewAction} className="mt-4 border-t pt-4">
            <p className="mb-2 text-sm md:text-[13px] text-muted">Save first, then send yourself a preview of the new-admin email.</p>
            <SubmitButton pendingText="Sending…">Send me a preview</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <GcalCard
        mode={env.GOOGLE_CALENDAR_MODE}
        icsSaved={icsSaved}
        icsFromEnv={Boolean(env.GOOGLE_CALENDAR_ICS_URL) && !s.googleIcsUrl}
        lastSyncAt={s.googleCalendarLastSyncAt}
        lastResult={s.googleCalendarLastResult}
        calendarId={env.GOOGLE_CALENDAR_ID}
        serviceAccountEmail={sa.ok ? sa.email : undefined}
        failingPushes={failing?.n ?? 0}
        actions={{ saveIcs: saveIcsUrlAction, test: testConnectionAction, sync: syncNowAction, importPast: importPastAction }}
      />

      <LicenseCard o={license} action={checkRegistryNowAction} />

      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
          <CardDescription>These are set by whoever runs your server (in the .env file). Ask them to change these.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <Status on={googleAuthEnabled()} label="Sign in with Google" help="Lets people sign in with a Google account. Recommended." />
          <Status on={smtpConfigured()} label="Email" help="Enables email confirmation, password reset links and decision emails." />
          <Status on={env.LEADERBOARD_ENABLED} label="Leaderboard" help="Hidden everywhere when off." />
        </CardContent>
      </Card>
    </div>
  );
}
