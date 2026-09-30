import { addDaysLocal, addMonthsLocal, monthStart, startOfLocalDay, startOfWeekLocal, todayLocal } from "@/lib/time";

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
    return { view, date: today, gridStart: today, from: startOfLocalDay(today, tz), to: startOfLocalDay(addDaysLocal(today, 120), tz), prev: today, next: today, title: "" };
  }
  const first = monthStart(date);
  const gridStart = startOfWeekLocal(first);
  const next = addMonthsLocal(first, 1);
  const gridEnd = addDaysLocal(startOfWeekLocal(addDaysLocal(next, -1)), 7);
  return { view, date: first, gridStart, from: startOfLocalDay(gridStart, tz), to: startOfLocalDay(gridEnd, tz), prev: addMonthsLocal(first, -1), next, title: "" };
}
