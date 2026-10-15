import { localDateOf, addDaysLocal, addMonthsLocal, monthStart, startOfLocalDay, startOfWeekLocal, todayLocal } from "@/lib/time";

export type CalendarViewKind = "month" | "week" | "agenda";
export const VIEWS: CalendarViewKind[] = ["month", "week", "agenda"];

export type CalendarRange = { view: CalendarViewKind; date: string; from: Date; to: Date; gridStart: string; prev: string; next: string; title: string };

/** Turn ?view & ?date into the visible range, in the team timezone. */
export function calendarRange(viewParam: string | undefined, dateParam: string | undefined, tz: string): CalendarRange {
  const view = (VIEWS as string[]).includes(viewParam ?? "") ? (viewParam as CalendarViewKind) : "month";
  const today = todayLocal(tz);
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && !Number.isNaN(Date.parse(dateParam)) ? dateParam : today;
  if (view === "week") {
    const gridStart = startOfWeekLocal(date);
    return { view, date, gridStart, from: startOfLocalDay(gridStart, tz), to: startOfLocalDay(addDaysLocal(gridStart, 7), tz), prev: addDaysLocal(gridStart, -7), next: addDaysLocal(gridStart, 7), title: "" };
  }
  if (view === "agenda") {
    // Agenda starts on the requested day (a tapped calendar day) and defaults to today.
    return { view, date, gridStart: date, from: startOfLocalDay(date, tz), to: startOfLocalDay(addDaysLocal(date, 120), tz), prev: date, next: date, title: "" };
  }
  const first = monthStart(date);
  const gridStart = startOfWeekLocal(first);
  const next = addMonthsLocal(first, 1);
  const gridEnd = addDaysLocal(startOfWeekLocal(addDaysLocal(next, -1)), 7);
  return { view, date: first, gridStart, from: startOfLocalDay(gridStart, tz), to: startOfLocalDay(gridEnd, tz), prev: addMonthsLocal(first, -1), next, title: "" };
}

/**
 * The days an agenda shows, in date order. A picked day with nothing on it still gets a section saying so, unless a
 * multi-day event runs through it (then that event's section already covers it).
 */
export function agendaEntries<T extends { startsAt: Date; endsAt: Date }>(byDay: Map<string, T[]>, picked: string, today: string, events: readonly T[], tz: string): [string, T[]][] {
  const entries = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const covered = byDay.has(picked) || events.some((e) => localDateOf(e.startsAt, tz) <= picked && localDateOf(e.endsAt, tz) >= picked);
  if (picked === today || covered) return entries;
  const at = entries.findIndex(([d]) => d > picked);
  entries.splice(at === -1 ? entries.length : at, 0, [picked, []]);
  return entries;
}
