import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, Monitor, Pencil } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { EventDetails } from "@/components/calendar/event-details";
import { SignupSection } from "@/components/signups/signup-section";
import { AttendCard } from "@/components/calendar/attend-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser, roleAtLeast } from "@/lib/auth/current-user";
import { attendLists, attendingCounts, myAttendNote } from "@/lib/attend";
import { getEvent, isOver } from "@/lib/events";
import { listGroups } from "@/lib/groups";
import { copySources } from "@/lib/signup-tools";
import { getSignupView } from "@/lib/signups";
import { formatInTz } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { uuidSchema } from "@/lib/validation";
import { attendAction, cancelEventAction, deleteEventAction } from "../actions";

export const metadata: Metadata = { title: "Event" };
export const dynamic = "force-dynamic";

export default async function EventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ deleteError?: string }> }) {
  const user = await requireUser();
  const { eventId } = await params;
  const { deleteError } = await searchParams;
  if (!uuidSchema.safeParse(eventId).success) notFound();
  const event = await getEvent(eventId);
  if (!event) notFound();
  const settings = await getSettings();
  const staff = roleAtLeast(user.role, "lead");
  const admin = roleAtLeast(user.role, "admin");
  const [mine, lists, counts, signups, groups, sources] = await Promise.all([
    myAttendNote(user.id, event.id),
    staff && event.rsvpEnabled ? attendLists(event.id) : null,
    attendingCounts([event.id]),
    getSignupView(event.id, { id: user.id, role: user.role }),
    staff ? listGroups() : [],
    staff ? copySources(event.id) : [],
  ]);
  const over = isOver(event);
  const open = !event.cancelledAt && !over && event.rsvpEnabled;

  return (
    <div className="space-y-6">
      <Link href="/calendar" className="text-sm md:text-[13px] text-muted underline-offset-4 hover:underline">← Calendar</Link>
      <EventDetails event={event} tz={settings.timezone} showVerification={staff} />

      {staff && !event.cancelledAt ? (
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href={`/display/${event.id}`}><Monitor aria-hidden />Start check-in display</Link>
        </Button>
      ) : null}

      {staff ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link href={`/calendar/${event.id}/edit`}><Pencil aria-hidden />Edit</Link></Button>
          {signups ? <Button asChild variant="secondary"><Link href={`/calendar/${event.id}/signups`}><ClipboardList aria-hidden />Manage sign-ups</Link></Button> : null}
          {!event.cancelledAt ? (
            <ConfirmAction
              label="Cancel event"
              size="md"
              danger
              title={`Cancel “${event.title}”?`}
              description="It stays on the calendar marked as cancelled, and everyone is notified. Can't be undone."
              confirmLabel="Cancel event"
              action={cancelEventAction}
              fields={{ id: event.id }}
            />
          ) : null}
          {admin ? <ConfirmAction
            label="Delete event"
            size="md"
            danger
            title={`Delete “${event.title}”?`}
            description="Removes the event, its sign-ups, and any check-ins and hours earned from it. Nobody is notified. Can't be undone. Cancel it instead to keep the records."
            confirmLabel="Delete event"
            action={deleteEventAction}
            fields={{ id: event.id }}
          /> : null}
        </div>
      ) : null}
      {admin && deleteError ? <p role="alert" className="rounded-lg bg-error-subtle p-3 text-sm text-error">{deleteError}</p> : null}

      {open ? (
        <AttendCard eventId={event.id} going={mine.going} note={mine.note} count={counts.get(event.id) ?? 0} action={attendAction} />
      ) : event.rsvpEnabled && mine.going ? (
        <p className="text-sm text-muted">You were signed up for this one.</p>
      ) : null}

      <SignupSection event={event} view={signups} tz={settings.timezone} staff={staff} groups={groups.map((g) => ({ id: g.id, name: g.name }))} copySources={sources.map((e) => ({ value: e.id, label: `${e.title} · ${formatInTz(e.startsAt, settings.timezone, "MMM d")}` }))} />

      {lists ? (
        <Card>
          <CardHeader><CardTitle>Who&apos;s coming</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {lists.going.length === 0 ? (
              <p className="text-sm text-muted">Nobody has signed up yet.</p>
            ) : (
              <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {lists.going.map((p) => (
                  <li key={p.userId}>
                    {p.name}
                    {p.note ? <span className="text-muted"> · {p.note}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {lists.notYet.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-sm text-muted hover:text-foreground">
                  Haven&apos;t signed up <Badge tone="info">{lists.notYet.length}</Badge>
                </summary>
                <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-2">
                  {lists.notYet.map((p) => <li key={p.id}>{p.name}</li>)}
                </ul>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
