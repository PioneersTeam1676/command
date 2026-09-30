import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CalendarView } from "@/components/calendar/calendar-view";
import { Button } from "@/components/ui/button";
import { requireUser, roleAtLeast } from "@/lib/auth/current-user";
import { calendarRange } from "@/lib/calendar-view";
import { listEventsBetween, listUpcomingEvents, myRsvps } from "@/lib/events";
import { calendarShiftInfo } from "@/lib/my-shifts";
import { getCurrentSeason } from "@/lib/seasons";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const settings = await getSettings();
  const range = calendarRange(sp.view, sp.date, settings.timezone);
  const [events, season] = await Promise.all([
    range.view === "agenda" ? listUpcomingEvents(range.from, 100) : listEventsBetween(range.from, range.to),
    getCurrentSeason(),
  ]);
  const [mine, shifts] = await Promise.all([myRsvps(user.id, events.map((e) => e.id)), calendarShiftInfo({ id: user.id, role: user.role })]);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold">Calendar</h1>
        {roleAtLeast(user.role, "lead") ? (
          <Button asChild><Link href="/calendar/new"><Plus aria-hidden />New event</Link></Button>
        ) : null}
      </div>
      <CalendarView events={events} range={range} tz={settings.timezone} season={season} basePath="/calendar" mine={mine} shifts={shifts} />
    </div>
  );
}
