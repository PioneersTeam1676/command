import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { CalendarView } from "@/components/calendar/calendar-view";
import { EmptyState } from "@/components/ui/empty-state";
import { requireParent } from "@/lib/auth/current-user";
import { calendarRange } from "@/lib/calendar-view";
import { listEventsBetween, listUpcomingEvents } from "@/lib/events";
import { calendarShiftInfo } from "@/lib/my-shifts";
import { approvedStudentIds } from "@/lib/parent-scope";
import { getCurrentSeason } from "@/lib/seasons";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

/** Read-only team calendar. Only available once at least one student link is approved. */
export default async function ParentCalendar({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const parent = await requireParent();
  if ((await approvedStudentIds(parent.id)).length === 0) {
    return <EmptyState icon={<CalendarDays />} title="Calendar unlocks after approval">Once the team approves your request to view your student, you&apos;ll see the team calendar here.</EmptyState>;
  }
  const sp = await searchParams;
  const settings = await getSettings();
  const range = calendarRange(sp.view, sp.date, settings.timezone);
  const [events, season] = await Promise.all([
    range.view === "agenda" ? listUpcomingEvents(range.from, 100) : listEventsBetween(range.from, range.to),
    getCurrentSeason(),
  ]);
  const shifts = await calendarShiftInfo({ id: parent.id, role: parent.role });
  return (
    <div>
      <h1 className="mb-6 text-[28px] font-semibold">Calendar</h1>
      <CalendarView events={events} range={range} tz={settings.timezone} season={season} basePath="/parent/calendar" shifts={shifts} />
    </div>
  );
}
