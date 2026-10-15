import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Download } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/form";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { HoursSummary, SessionList } from "@/components/session-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { backfillableEvents, listMySessions } from "@/lib/attendance";
import { pendingRequestsFor } from "@/lib/attendance-requests";
import { SessionChangeControls } from "@/components/session-change";
import { requireUser } from "@/lib/auth/current-user";
import { overlappingIds } from "@/lib/overlaps";
import { SeasonPicker } from "@/components/season-picker";
import { getCurrentSeason, getSeason, listSeasons } from "@/lib/seasons";
import { getSettings } from "@/lib/settings";
import { formatInTz, toDatetimeLocal } from "@/lib/time";
import { backfillDayAction, backfillEventAction } from "./actions";

export const metadata: Metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

export default async function HoursPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const user = await requireUser();
  const { season: seasonParam } = await searchParams;
  const settings = await getSettings();
  const tz = settings.timezone;
  const [current, allSeasons] = await Promise.all([getCurrentSeason(), listSeasons()]);
  const season = (seasonParam ? await getSeason(seasonParam) : undefined) ?? current;
  const isCurrent = season.id === current.id;
  const rows = await listMySessions(user.id, season.id);
  const flagged = overlappingIds(rows.map((r) => r.session));
  const pending = await pendingRequestsFor(rows.map((r) => r.session.id));
  const list = rows.map((r) => ({ ...r.session, eventTitle: r.eventTitle, overlaps: flagged.has(r.session.id), pending: pending.get(r.session.id)?.kind }));
  const missed = isCurrent ? await backfillableEvents(user.id, season.id) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
      <SeasonPicker seasons={allSeasons} selectedId={season.id} />
      <HoursSummary sessions={list} tz={tz} seasonLabel={season.name} />
      <Button asChild variant="secondary" size="sm"><Link href={`/api/export/my-hours?season=${season.id}`}><Download aria-hidden />Download my hours (CSV)</Link></Button>

      {list.length === 0 ? (
        <EmptyState icon={<Clock />} title="No hours yet">Clock in from the Home screen or check in to an event, and your time shows up here.</EmptyState>
      ) : (
        <SessionList
          sessions={list}
          tz={tz}
          flags
          actions={(row) =>
            isCurrent && !row.pending && row.clockOutAt && ["closed", "edited", "auto_closed"].includes(row.status) && row.reviewState !== "rejected" && row.reviewState !== "pending_approval" ? (
              <SessionChangeControls id={row.id} inAt={toDatetimeLocal(row.clockInAt, tz)} outAt={toDatetimeLocal(row.clockOutAt, tz)} tz={tz} />
            ) : null
          }
        />
      )}

      {isCurrent ? (
        <Card>
          <CardHeader>
            <CardTitle>Forgot to clock in?</CardTitle>
            <CardDescription>
              Add time for something you attended. It&apos;s marked as manually added and counts after a lead or admin approves it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div>
              <h3 className="mb-3 text-sm font-medium">A past event</h3>
              {missed.length === 0 ? (
                <p className="text-sm md:text-[13px] text-muted">No past events are waiting for your time.</p>
              ) : (
                <ActionForm action={backfillEventAction} resetOnSuccess className="space-y-4">
                  <SelectField
                    name="eventId"
                    label="Event"
                    options={missed.map((e) => ({ value: e.id, label: `${e.title} · ${formatInTz(e.startsAt, tz, "MMM d")}` }))}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField name="inAt" label="In" type="datetime-local" defaultValue={toDatetimeLocal(missed[0]!.startsAt, tz)} required help={`In ${tz}`} />
                    <TextField name="outAt" label="Out" type="datetime-local" defaultValue={toDatetimeLocal(missed[0]!.endsAt, tz)} required />
                  </div>
                  <TextAreaField name="note" label="Note (optional)" maxLength={300} rows={2} />
                  <SubmitButton pendingText="Sending…">Add time</SubmitButton>
                </ActionForm>
              )}
            </div>
            <div>
              <h3 className="mb-3 text-sm font-medium">A build season day</h3>
              <ActionForm action={backfillDayAction} resetOnSuccess className="space-y-4">
                <TextField name="date" label="Day" type="date" required help="A day that already happened, during build season." />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField name="inAt" label="In" type="datetime-local" required help={`In ${tz}`} />
                  <TextField name="outAt" label="Out" type="datetime-local" required />
                </div>
                <TextAreaField name="note" label="Note (optional)" maxLength={300} rows={2} />
                <SubmitButton pendingText="Sending…">Add time</SubmitButton>
              </ActionForm>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
