import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Monitor, Pencil } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { EventDetails } from "@/components/calendar/event-details";
import { RsvpForm } from "@/components/calendar/rsvp-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser, roleAtLeast } from "@/lib/auth/current-user";
import { getEvent, getRsvp, isOver, rsvpLists } from "@/lib/events";
import { getSettings } from "@/lib/settings";
import { uuidSchema } from "@/lib/validation";
import { cancelEventAction, deleteEventAction, rsvpAction } from "../actions";

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
  const [mine, lists] = await Promise.all([getRsvp(user.id, event.id), staff ? rsvpLists(event.id) : null]);
  const over = isOver(event);
  const open = !event.cancelledAt && !over;

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
          {!event.cancelledAt ? (
            <ConfirmAction
              label="Cancel event"
              size="md"
              danger
              title={`Cancel “${event.title}”?`}
              description="It stays on the calendar marked as cancelled, and everyone gets a notification. This can't be undone."
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
            description="This removes the event and its RSVPs for good, with no notification. It can't be undone. Any check-ins recorded for it, and the hours they earned, are removed too. Cancel it instead if you want to keep them."
            confirmLabel="Delete event"
            action={deleteEventAction}
            fields={{ id: event.id }}
          /> : null}
        </div>
      ) : null}
      {admin && deleteError ? <p role="alert" className="rounded-[8px] bg-error-subtle p-3 text-sm text-error">{deleteError}</p> : null}

      {open ? (
        <Card>
          <CardHeader><CardTitle>Will you be there?</CardTitle></CardHeader>
          <CardContent><RsvpForm eventId={event.id} current={mine?.response as never} reason={mine?.reason} action={rsvpAction} /></CardContent>
        </Card>
      ) : mine ? (
        <p className="text-sm text-muted">Your answer: <strong className="text-foreground capitalize">{mine.response === "cant" ? "Can't go" : mine.response}</strong></p>
      ) : null}

      {lists ? (
        <Card>
          <CardHeader><CardTitle>Who&apos;s coming</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {(
              [
                ["Going", lists.going, "success"],
                ["Maybe", lists.maybe, "warning"],
                ["Can't go", lists.cant, "neutral"],
                ["No response yet", lists.noResponse, "info"],
              ] as const
            ).map(([label, list, tone]) => (
              <section key={label} aria-label={label}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  {label} <Badge tone={tone}>{list.length}</Badge>
                </h3>
                {list.length === 0 ? (
                  <p className="text-sm md:text-[13px] text-muted">Nobody</p>
                ) : (
                  <ul className="space-y-1 text-sm md:text-[13px]">
                    {list.map((p) => (
                      <li key={"userId" in p ? p.userId : p.id}>
                        {p.name}
                        {"reason" in p && p.reason ? <span className="text-muted"> · {p.reason}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
