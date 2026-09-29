import { addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Everything is stored in UTC. The team has one IANA timezone; "today", schedules and reminders are
 * all computed in it. Local dates are plain `yyyy-MM-dd` strings so they never drift with the server TZ.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export const isLocalDate = (s: string) => DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** The team-local calendar date of an instant. */
export function localDateOf(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "yyyy-MM-dd");
}

export const todayLocal = (tz: string, now: Date = new Date()) => localDateOf(now, tz);

/** Local wall-clock date + time (`HH:mm`) in `tz` to a UTC instant. Times skipped by DST move forward. */
export function localToUtc(date: string, time: string, tz: string): Date {
  if (!isLocalDate(date) || !TIME_RE.test(time)) throw new RangeError(`Invalid local date/time: ${date} ${time}`);
  const t = time.length === 5 ? `${time}:00` : time;
  return fromZonedTime(`${date}T${t}`, tz);
}

/** The UTC instant at which a local day begins. */
export const startOfLocalDay = (date: string, tz: string) => localToUtc(date, "00:00", tz);

/** Exclusive end of a local day (start of the next one). The day is 23 or 25 hours long on DST changes. */
export const endOfLocalDay = (date: string, tz: string) => startOfLocalDay(addDaysLocal(date, 1), tz);

/** Add whole days to a plain local date. Pure calendar arithmetic, no timezone involved. */
export function addDaysLocal(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a plain local date. */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Date the `HH:mm` local time on `date` in `tz`, as an instant. */
export const atLocalTime = localToUtc;

export function formatInTz(instant: Date, tz: string, pattern: string): string {
  return formatInTimeZone(instant, tz, pattern);
}

/** Value for `<input type="datetime-local">` in the team timezone. */
export const toDatetimeLocal = (instant: Date, tz: string) => formatInTimeZone(instant, tz, "yyyy-MM-dd'T'HH:mm");

/** Parse a `datetime-local` value typed in the team timezone. */
export function fromDatetimeLocal(value: string, tz: string): Date {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  if (!m) throw new RangeError(`Invalid datetime: ${value}`);
  return localToUtc(m[1]!, m[2]!, tz);
}

export const inRange = (date: string, start: string | null, end: string | null) =>
  (start === null || date >= start) && (end === null || date <= end);

export type SeasonDays = { buildStart: string | null; buildEnd: string | null; workdays: number[] };

/** Inside the build season date range (inclusive). Open clock-in is allowed on any such day. */
export function inBuildSeason(date: string, s: SeasonDays): boolean {
  return s.buildStart !== null && s.buildEnd !== null && inRange(date, s.buildStart, s.buildEnd);
}

/** A workday inside the build season: the only days reminders fire. */
export const isBuildWorkday = (date: string, s: SeasonDays) => inBuildSeason(date, s) && s.workdays.includes(weekdayOf(date));

/** Days between two plain local dates (end - start). */
export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

export function addMonthsLocal(date: string, months: number): string {
  const d = new Date(`${monthStart(date)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function startOfWeekLocal(date: string, weekStartsOn = 0): string {
  const diff = (weekdayOf(date) - weekStartsOn + 7) % 7;
  return addDaysLocal(date, -diff);
}

/** Convenience for jobs: an instant `minutes` from `d`. */
export const plusMinutes = (d: Date, minutes: number) => addMinutes(d, minutes);

export { toZonedTime };
