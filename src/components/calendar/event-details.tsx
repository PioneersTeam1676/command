import { CalendarClock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EventRow } from "@/lib/events";
import { formatInTz, localDateOf } from "@/lib/time";

export function EventDetails({ event, tz, showVerification = false }: { event: EventRow; tz: string; showVerification?: boolean }) {
  const sameDay = localDateOf(event.startsAt, tz) === localDateOf(event.endsAt, tz);
  const cancelled = Boolean(event.cancelledAt);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className={`text-[28px] font-semibold ${cancelled ? "text-muted line-through" : ""}`}>{event.title}</h1>
        {cancelled ? <Badge tone="error">Cancelled</Badge> : null}
        {event.source === "imported" ? <Badge>From Google Calendar</Badge> : null}
      </div>
      <p className="flex items-start gap-2 text-[15px]">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <span>
          {formatInTz(event.startsAt, tz, "EEEE, MMMM d")}
          <br />
          <span className="font-mono text-[13px] text-muted">
            {formatInTz(event.startsAt, tz, "h:mm a")} – {sameDay ? formatInTz(event.endsAt, tz, "h:mm a") : formatInTz(event.endsAt, tz, "EEE MMM d, h:mm a")} ({formatInTz(event.startsAt, tz, "zzz")})
          </span>
        </span>
      </p>
      {event.locationText ? (
        <p className="flex items-start gap-2 text-[15px]">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          {event.locationText}
        </p>
      ) : null}
      {event.description ? <p className="whitespace-pre-wrap text-[15px] text-foreground/90">{event.description}</p> : null}
      {showVerification ? (
        <p className="text-[13px] text-muted">
          Check-in: {event.verification === "code" ? "rotating code" : event.verification === "none" ? "one tap" : "team default"}
        </p>
      ) : null}
    </div>
  );
}
