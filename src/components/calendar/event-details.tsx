import { CalendarClock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EventRow } from "@/lib/events";
import { formatInTz, localDateOf } from "@/lib/time";
import { EventDescription } from "./event-description";

export function EventDetails({ event, tz, showVerification = false }: { event: EventRow; tz: string; showVerification?: boolean }) {
  const sameDay = localDateOf(event.startsAt, tz) === localDateOf(event.endsAt, tz);
  const cancelled = Boolean(event.cancelledAt);
  const tags = cancelled || event.source === "imported" || event.isOutreach;
  return (
    <div className="min-w-0 space-y-5">
      <div className="space-y-2">
        <h1 className={`break-words text-xl font-semibold leading-snug tracking-tight [overflow-wrap:anywhere] md:text-2xl ${cancelled ? "text-muted line-through" : ""}`}>{event.title}</h1>
        {tags ? (
          <div className="flex flex-wrap items-center gap-2">
            {cancelled ? <Badge tone="error">Cancelled</Badge> : null}
            {event.source === "imported" ? <Badge>From Google Calendar</Badge> : null}
            {event.isOutreach ? <Badge tone="info">Outreach</Badge> : null}
          </div>
        ) : null}
      </div>

      <dl className="space-y-3 text-[15px]">
        <div className="flex min-w-0 items-start gap-3">
          <dt className="sr-only">When</dt>
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <dd className="min-w-0">
            <span className="block font-medium">{formatInTz(event.startsAt, tz, "EEEE, MMMM d")}</span>
            <span className="mt-0.5 block font-mono text-sm text-muted md:text-[13px]">
              {formatInTz(event.startsAt, tz, "h:mm a")} – {sameDay ? formatInTz(event.endsAt, tz, "h:mm a") : formatInTz(event.endsAt, tz, "EEE MMM d, h:mm a")} ({formatInTz(event.startsAt, tz, "zzz")})
            </span>
          </dd>
        </div>
        {event.locationText ? (
          <div className="flex min-w-0 items-start gap-3">
            <dt className="sr-only">Where</dt>
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <dd className="min-w-0 break-words [overflow-wrap:anywhere]">{event.locationText}</dd>
          </div>
        ) : null}
      </dl>

      {event.description ? <EventDescription text={event.description} /> : null}
      {!event.rsvpEnabled ? <p className="text-sm text-muted md:text-[13px]">Nothing to sign up for. Just show up.</p> : null}
      {showVerification ? (
        <p className="text-sm text-muted md:text-[13px]">
          Check-in: {event.verification === "code" ? "rotating code" : event.verification === "none" ? "one tap" : "team default"}
        </p>
      ) : null}
    </div>
  );
}
