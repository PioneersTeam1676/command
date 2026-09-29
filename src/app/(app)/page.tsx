import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { ClockHero } from "@/components/clock/clock-hero";
import { EventClockCard } from "@/components/clock/event-clock-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GridBackground } from "@/components/ui/grid-background";
import { requireUser } from "@/lib/auth/current-user";
import { isReadOnly } from "@/lib/registry";
import { RSVP_LABEL } from "@/lib/events";
import { getHomeData, type EventCard } from "@/lib/home";
import { formatInTz } from "@/lib/time";
import { rsvpQuickAction } from "./calendar/actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const [home, readOnly] = await Promise.all([getHomeData(user.id), isReadOnly()]);
  const tz = home.tz;
  const first = user.name.split(" ")[0];
  const cutoffLabel = formatInTz(home.cutoffLabelAt, tz, "h:mm a");

  const idle = readOnly
    ? "Clocking in is paused while Command is read-only"
    : home.todaysOpen?.clockOutAt
    ? `You already clocked out today (${formatInTz(home.todaysOpen.clockInAt, tz, "h:mm a")} – ${formatInTz(home.todaysOpen.clockOutAt, tz, "h:mm a")})`
    : home.buildDay
      ? `Clock-in closed for today at ${cutoffLabel}`
      : "It isn't build season right now. Check in from an event below.";

  const eventProps = (c: EventCard) => ({
    eventId: c.event.id,
    title: c.event.title,
    whenLabel: `${formatInTz(c.event.startsAt, tz, "EEE h:mm a")} – ${formatInTz(c.event.endsAt, tz, "h:mm a")}`,
    cancelled: Boolean(c.event.cancelledAt),
    canCheckIn: c.canCheckIn,
    needsCode: c.verification === "code",
    rsvpLabel: c.rsvp ? RSVP_LABEL[c.rsvp] : undefined,
    session: c.session
      ? {
          clockedOut: c.session.status !== "open",
          inLabel: formatInTz(c.session.clockInAt, tz, "h:mm a"),
          outLabel: c.session.clockOutAt ? formatInTz(c.session.clockOutAt, tz, "h:mm a") : undefined,
        }
      : null,
    opensLabel: `Check-in opens ${formatInTz(new Date(c.event.startsAt.getTime() - 30 * 60_000), tz, "h:mm a")}`,
  });

  return (
    <div className="space-y-8">
      <GridBackground className="-mx-4 -mt-6 px-4 pb-4 pt-6 md:-mx-8 md:-mt-8 md:px-8 md:pt-8">
        <h1 className="text-[28px] font-semibold">Hi, {first}</h1>
        <p className="mt-0.5 text-sm text-muted">{formatInTz(new Date(), tz, "EEEE, MMMM d")}{home.buildDay ? (home.workday ? " · Build season workday" : " · Build season") : ""}</p>
        <div className="mt-4">
          <ClockHero
            runningSince={home.openSession?.clockInAt.toISOString() ?? null}
            canClockIn={home.openClockInAllowed && !readOnly}
            idleMessage={idle}
            cutoffLabel={cutoffLabel}
          />
        </div>
      </GridBackground>

      <section aria-labelledby="today-h">
        <h2 id="today-h" className="mb-3 text-lg font-semibold">Today</h2>
        {home.todayEvents.length === 0 ? (
          <p className="text-sm text-muted">No events today.</p>
        ) : (
          <div className="space-y-3">
            {home.todayEvents.map((c) => (
              <EventClockCard key={c.event.id} {...eventProps(c)} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="up-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="up-h" className="text-lg font-semibold">Coming up</h2>
          <Button asChild variant="ghost" size="sm"><Link href="/calendar?view=agenda">See all</Link></Button>
        </div>
        {home.upcoming.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title="Nothing scheduled yet">When your team adds events, you&apos;ll be able to RSVP right here.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {home.upcoming.map((c) => (
              <li key={c.event.id} className="rounded-[8px] border p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/calendar/${c.event.id}`} className="min-w-0">
                    <p className={`truncate font-medium ${c.event.cancelledAt ? "text-muted line-through" : ""}`}>{c.event.title}</p>
                    <p className="font-mono text-[12px] text-muted">{formatInTz(c.event.startsAt, tz, "EEE MMM d, h:mm a")}</p>
                  </Link>
                  {c.event.cancelledAt ? <Badge tone="error">Cancelled</Badge> : null}
                </div>
                {c.event.cancelledAt ? null : (
                  <form action={rsvpQuickAction} className="mt-3 grid grid-cols-3 gap-2">
                    <input type="hidden" name="eventId" value={c.event.id} />
                    {(["going", "maybe", "cant"] as const).map((r) => (
                      <Button key={r} type="submit" name="response" value={r} size="sm" variant={c.rsvp === r ? "primary" : "secondary"} aria-pressed={c.rsvp === r}>
                        {RSVP_LABEL[r]}
                      </Button>
                    ))}
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
