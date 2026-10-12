import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { ClockHero } from "@/components/clock/clock-hero";
import { EventClockCard } from "@/components/clock/event-clock-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/current-user";
import { getHomeData, type EventCard } from "@/lib/home";
import { myShifts, openShiftsFor } from "@/lib/my-shifts";
import { pickGreeting } from "@/lib/greetings";
import { formatInTz } from "@/lib/time";
import { attendQuickAction } from "./calendar/actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const [home, shifts, openShifts] = await Promise.all([getHomeData(user.id), myShifts(user.id), openShiftsFor({ id: user.id, role: user.role })]);
  const tz = home.tz;
  const first = user.name.split(" ")[0];
  const greeting = pickGreeting(Number(formatInTz(new Date(), tz, "H")));
  const cutoffLabel = formatInTz(home.cutoffLabelAt, tz, "h:mm a");

  const eventProps = (c: EventCard) => ({
    eventId: c.event.id,
    title: c.event.title,
    whenLabel: `${formatInTz(c.event.startsAt, tz, "EEE h:mm a")} – ${formatInTz(c.event.endsAt, tz, "h:mm a")}`,
    cancelled: Boolean(c.event.cancelledAt),
    canCheckIn: c.canCheckIn,
    needsCode: c.verification === "code",
    goingLabel: c.going ? "Going" : undefined,
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
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting}, {first}!</h1>
        <p className="mt-0.5 text-sm text-muted">{formatInTz(new Date(), tz, "EEEE, MMMM d")}{home.buildDay ? (home.workday ? " · Build season workday" : " · Build season") : ""}</p>
        <div className="mt-6">
          <ClockHero
            runningSince={home.openSession?.clockInAt.toISOString() ?? null}
            offHours={home.offHours}
            showOffHoursNotice={home.showOffHoursNotice}
            noteMode={home.clockoutNote}
            cutoffLabel={cutoffLabel}
          />
        </div>
      </div>

      <section aria-labelledby="today-h">
        <h2 id="today-h" className="mb-3 text-base font-semibold tracking-tight">Today</h2>
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

      {shifts.upcoming.length > 0 || openShifts.length > 0 ? (
        <section aria-labelledby="shifts-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="shifts-h" className="text-base font-semibold tracking-tight">Your shifts</h2>
            <Button asChild variant="ghost" size="sm"><Link href="/me/shifts">All my shifts</Link></Button>
          </div>
          {shifts.upcoming.length > 0 ? (
            <ul className="space-y-2">
              {shifts.upcoming.slice(0, 3).map((m) => (
                <li key={m.entryId}>
                  <Link href={`/calendar/${m.eventId}`} className="flex items-start justify-between gap-3 rounded-lg border p-4 transition-colors duration-150 hover:bg-surface md:rounded-lg md:p-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.slot.title} <span className="font-normal text-muted">· {m.eventTitle}</span></span>
                      <span className="block font-mono text-[13px] md:text-[12px] text-muted">{formatInTz(m.slot.startsAt, tz, "EEE MMM d, h:mm a")}</span>
                    </span>
                    <Badge tone={m.status === "waitlisted" ? "warning" : "success"}>{m.status === "waitlisted" ? `Waitlist ${m.position}` : "You're on it"}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {openShifts.length > 0 ? (
            <p className="mt-3 text-sm md:text-[13px] text-muted">
              <Link href="/me/shifts" className="font-medium text-foreground underline-offset-4 hover:underline">{openShifts.length} {openShifts.length === 1 ? "shift" : "shifts"} you can take</Link>
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="up-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="up-h" className="text-base font-semibold tracking-tight">Coming up</h2>
          <Button asChild variant="ghost" size="sm"><Link href="/calendar?view=agenda">See all</Link></Button>
        </div>
        {home.upcoming.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title="Nothing scheduled yet">When your team adds events, you&apos;ll be able to sign up right here.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {home.upcoming.map((c) => (
              <li key={c.event.id} className="rounded-lg border p-5 md:rounded-lg md:p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/calendar/${c.event.id}`} className="min-w-0">
                    <p className={`truncate font-medium ${c.event.cancelledAt ? "text-muted line-through" : ""}`}>{c.event.title}</p>
                    <p className="font-mono text-[13px] md:text-[12px] text-muted">{formatInTz(c.event.startsAt, tz, "EEE MMM d, h:mm a")}</p>
                  </Link>
                  {c.event.cancelledAt ? <Badge tone="error">Cancelled</Badge> : null}
                </div>
                {c.event.cancelledAt || !c.event.rsvpEnabled ? null : (
                  <form action={attendQuickAction} className="mt-3">
                    <input type="hidden" name="eventId" value={c.event.id} />
                    <input type="hidden" name="going" value={c.going ? "false" : "true"} />
                    <Button type="submit" size="sm" variant={c.going ? "secondary" : "primary"} className="w-full sm:w-auto">
                      {c.going ? "You're going · Undo" : "I'm going"}
                    </Button>
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
