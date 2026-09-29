import { format } from "date-fns";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormState } from "@/lib/form";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function GcalCard({
  mode,
  icsSaved,
  icsFromEnv,
  lastSyncAt,
  lastResult,
  calendarId,
  serviceAccountEmail,
  failingPushes,
  actions,
}: {
  mode: "off" | "ics" | "api";
  icsSaved: string | null;
  icsFromEnv: boolean;
  lastSyncAt: Date | null;
  lastResult: string | null;
  calendarId?: string;
  serviceAccountEmail?: string;
  failingPushes: number;
  actions: { saveIcs: Action; test: Action; sync: Action; importPast: Action };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Google Calendar <Badge tone={mode === "off" ? "neutral" : "success"}>{mode === "off" ? "Off" : mode === "ics" ? "Import (ICS)" : "Two-way push (API)"}</Badge>
        </CardTitle>
        <CardDescription>
          {mode === "off" && "Turned off. Whoever runs your server can enable it with GOOGLE_CALENDAR_MODE (see the README)."}
          {mode === "ics" && "Command reads your Google Calendar every 10 minutes and shows its events. Changes are made in Google Calendar, not here."}
          {mode === "api" && "Events you create, edit or cancel in Command are sent to your Google Calendar. Changes made directly in Google Calendar afterwards are not read back."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {mode === "ics" ? (
          <ActionForm action={actions.saveIcs} className="space-y-3">
            <TextField
              name="url"
              label="Secret address in iCal format"
              type="url"
              placeholder={icsSaved ?? "https://calendar.google.com/calendar/ical/…/basic.ics"}
              autoComplete="off"
              help={
                icsSaved
                  ? `Saved (${icsSaved}). Paste a new address to replace it, or clear the box and save to remove it.`
                  : icsFromEnv
                    ? "Using the address from your server settings. Paste one here to override it."
                    : "In Google Calendar: Settings → your calendar → Integrate calendar → “Secret address in iCal format”. Anyone with this address can read your calendar, so keep it private."
              }
            />
            <SubmitButton variant="secondary" pendingText="Saving…">Save address</SubmitButton>
          </ActionForm>
        ) : null}

        {mode === "api" ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-sm md:text-[13px] text-muted">Calendar</dt>
              <dd className="break-all font-mono text-sm md:text-[13px]">{calendarId ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-sm md:text-[13px] text-muted">Share your calendar with this email (“Make changes to events”)</dt>
              <dd className="break-all font-mono text-sm md:text-[13px]">{serviceAccountEmail ?? "Key not set"}</dd>
            </div>
          </dl>
        ) : null}

        {mode !== "off" ? (
          <div className="flex flex-wrap gap-3">
            <ActionForm action={actions.test} className="space-y-3">
              <SubmitButton variant="secondary" pendingText="Testing…">Test connection</SubmitButton>
            </ActionForm>
            {mode === "ics" ? (
              <ActionForm action={actions.sync} className="space-y-3">
                <SubmitButton variant="secondary" pendingText="Syncing…">Sync now</SubmitButton>
              </ActionForm>
            ) : null}
          </div>
        ) : null}

        {mode === "ics" ? (
          <p className="text-sm md:text-[13px] text-muted">
            {lastSyncAt ? <>Last check: <span className="font-mono">{format(lastSyncAt, "MMM d, h:mm a")}</span>. </> : "Not checked yet. "}
            {lastResult ? <span className={lastResult.startsWith("Failed") ? "text-error" : ""}>{lastResult}</span> : null}
          </p>
        ) : null}

        {mode === "api" ? (
          <>
            {failingPushes > 0 ? <p role="alert" className="rounded-[8px] border bg-warning-subtle p-3 text-sm md:text-[13px] text-warning">{failingPushes} change{failingPushes === 1 ? "" : "s"} couldn&apos;t be sent to Google yet. Command keeps retrying. Use “Test connection” to see why.</p> : null}
            <div className="border-t pt-5">
              <h3 className="text-sm font-medium">Import past events</h3>
              <p className="mb-3 mt-1 text-sm md:text-[13px] text-muted">Brings events already on your Google Calendar into Command so members can add their attendance. Safe to run again: events already imported are skipped, and nothing is sent back to Google.</p>
              <ActionForm action={actions.importPast} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField name="from" label="From" type="date" required />
                  <TextField name="to" label="To" type="date" required />
                </div>
                <SubmitButton variant="secondary" pendingText="Importing…">Import events</SubmitButton>
              </ActionForm>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
