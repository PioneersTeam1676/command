import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/form";
import { SelectField, TextField } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { getEnv, googleAuthEnabled, smtpConfigured } from "@/lib/env";
import { readSettings } from "@/lib/settings";
import { saveAttendanceAction, saveRemindersAction, saveTeamAction } from "./actions";

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
        <p className="text-[13px] text-muted">{help}</p>
      </div>
      <Badge tone={on ? "success" : "neutral"}>{on ? "On" : "Off"}</Badge>
    </div>
  );
}

export default async function SettingsPage() {
  await requireUser({ min: "admin" });
  const s = await readSettings();
  const env = getEnv();
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
                <span className="block text-[13px] text-muted">When someone adds time they forgot to clock, a lead or admin must approve it before it counts. If you turn this off, it counts right away and is marked “self-reported”.</span>
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
          <CardTitle>Connections</CardTitle>
          <CardDescription>These are set by whoever runs your server (in the .env file). Ask them to change these.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <Status on={googleAuthEnabled()} label="Sign in with Google" help="Lets people sign in with a Google account. Recommended." />
          <Status on={smtpConfigured()} label="Email" help="Enables email confirmation, password reset links and decision emails." />
          <Status on={env.LEADERBOARD_ENABLED} label="Leaderboard" help="Hidden everywhere when off." />
          <Status on={env.GOOGLE_CALENDAR_MODE !== "off"} label={`Google Calendar (${env.GOOGLE_CALENDAR_MODE})`} help="Imports or pushes events." />
        </CardContent>
      </Card>
    </div>
  );
}
