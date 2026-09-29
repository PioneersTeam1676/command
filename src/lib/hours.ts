import { addDaysLocal, endOfLocalDay, localDateOf, startOfLocalDay } from "@/lib/time";

/**
 * Hours math. One place, fully tested (spec 6.9).
 *
 * Rules:
 *  - Only sessions that have ended count: `closed`, `edited`, or `auto_closed` (until rejected).
 *  - `open` sessions have no end yet, so they don't count.
 *  - `rejected` and `pending_approval` (backfill awaiting a lead) never count.
 *  - Hours are the length of the UNION of a member's intervals, so overlapping open and event
 *    sessions are never double counted.
 */

export type HoursSession = {
  clockInAt: Date;
  clockOutAt: Date | null;
  status: string;
  reviewState: string;
};

export type Interval = readonly [start: Date, end: Date];

const COUNTABLE_STATUS = new Set(["closed", "edited", "auto_closed"]);
const EXCLUDED_REVIEW = new Set(["rejected", "pending_approval"]);

export function countsTowardHours(s: HoursSession): boolean {
  if (!s.clockOutAt) return false;
  if (!COUNTABLE_STATUS.has(s.status)) return false;
  if (EXCLUDED_REVIEW.has(s.reviewState)) return false;
  return s.clockOutAt.getTime() > s.clockInAt.getTime();
}

/** Merge overlapping or touching intervals. Input order doesn't matter; the input isn't mutated. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].filter(([a, b]) => b.getTime() > a.getTime()).sort((x, y) => x[0].getTime() - y[0].getTime());
  const out: [Date, Date][] = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    if (last && start.getTime() <= last[1].getTime()) {
      if (end.getTime() > last[1].getTime()) last[1] = end;
    } else {
      out.push([start, end]);
    }
  }
  return out;
}

export const intervalsOf = (sessions: readonly HoursSession[]): Interval[] =>
  sessions.filter(countsTowardHours).map((s) => [s.clockInAt, s.clockOutAt as Date] as const);

/** Total milliseconds in the union of countable sessions. */
export function totalMs(sessions: readonly HoursSession[]): number {
  return mergeIntervals(intervalsOf(sessions)).reduce((sum, [a, b]) => sum + (b.getTime() - a.getTime()), 0);
}

export const msToHours = (ms: number) => ms / 3_600_000;

export const totalHours = (sessions: readonly HoursSession[]) => msToHours(totalMs(sessions));

/**
 * Milliseconds per team-local date. A session crossing local midnight is split at midnight, and the
 * 23/25 hour days around DST changes are respected because the split uses real local midnights.
 */
export function msByLocalDate(sessions: readonly HoursSession[], tz: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [start, end] of mergeIntervals(intervalsOf(sessions))) {
    let day = localDateOf(start, tz);
    let cursor = start.getTime();
    while (cursor < end.getTime()) {
      const dayEnd = endOfLocalDay(day, tz).getTime();
      const sliceEnd = Math.min(dayEnd, end.getTime());
      out.set(day, (out.get(day) ?? 0) + (sliceEnd - cursor));
      cursor = sliceEnd;
      day = addDaysLocal(day, 1);
    }
  }
  return out;
}

/** Milliseconds within [from, to) after merging. Handy for "hours this week". */
export function totalMsBetween(sessions: readonly HoursSession[], from: Date, to: Date): number {
  let sum = 0;
  for (const [a, b] of mergeIntervals(intervalsOf(sessions))) {
    const s = Math.max(a.getTime(), from.getTime());
    const e = Math.min(b.getTime(), to.getTime());
    if (e > s) sum += e - s;
  }
  return sum;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** True when two intervals share any time (touching end-to-start is not an overlap). */
export const overlaps = (a: Interval, b: Interval) => a[0].getTime() < b[1].getTime() && b[0].getTime() < a[1].getTime();

export { startOfLocalDay };
