import { and, eq, inArray, isNull, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { attendanceSessions, events, users } from "@/db/schema";
import { totalMs, type HoursSession } from "@/lib/hours";

export type LeaderboardTab = "hours" | "attendance";

export type Entry = { userId: string; name: string; hours: number; eventsAttended: number; attendanceRate: number | null };
export type Ranked = Entry & { rank: number; value: number | null };

/**
 * Competition ranking ("1224"): equal values share a rank. Entries with no value (e.g. no events to
 * attend yet) go last, unranked. Ties break by name so the order is stable.
 */
export function rankEntries(entries: readonly Entry[], tab: LeaderboardTab): Ranked[] {
  const valueOf = (e: Entry) => (tab === "hours" ? e.hours : e.attendanceRate);
  const sorted = [...entries].sort((a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    if (av === null && bv === null) return a.name.localeCompare(b.name);
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av || a.name.localeCompare(b.name);
  });
  const out: Ranked[] = [];
  let lastValue: number | null | undefined;
  let lastRank = 0;
  sorted.forEach((e, i) => {
    const v = valueOf(e);
    if (v === null) {
      out.push({ ...e, rank: 0, value: null });
      return;
    }
    // Compare at display precision so 12.004 and 12.001 (both "12.0") tie visibly.
    const key = tab === "hours" ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000;
    if (lastValue === undefined || key !== lastValue) lastRank = i + 1;
    lastValue = key;
    out.push({ ...e, rank: lastRank, value: v });
  });
  return out;
}

/** Attendance rate = events attended / all non-cancelled events that have ended in the season. Null if none ended. */
export const attendanceRate = (attended: number, endedEvents: number): number | null => (endedEvents === 0 ? null : Math.min(1, attended / endedEvents));

type Computed = Entry & { hidden: boolean };

async function computeAll(seasonId: string, now: Date): Promise<{ all: Computed[]; endedEvents: number }> {
  const members = await db
    .select({ id: users.id, name: users.name, hidden: users.leaderboardHidden })
    .from(users)
    .where(and(eq(users.status, "active"), inArray(users.role, ["member", "lead", "admin"])));
  const ended = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.seasonId, seasonId), isNull(events.cancelledAt), lte(events.endsAt, now)));
  const endedIds = new Set(ended.map((e) => e.id));
  const sessions = await db
    .select()
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.seasonId, seasonId), ne(attendanceSessions.reviewState, "rejected")));
  const byUser = new Map<string, typeof sessions>();
  for (const s of sessions) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
  const all = members.map((m) => {
    const mine = byUser.get(m.id) ?? [];
    const hs: HoursSession[] = mine.map((s) => ({ clockInAt: s.clockInAt, clockOutAt: s.clockOutAt, status: s.status, reviewState: s.reviewState }));
    const attended = new Set(mine.filter((s) => s.kind === "event" && s.eventId && endedIds.has(s.eventId) && s.reviewState !== "pending_approval").map((s) => s.eventId!));
    return { userId: m.id, name: m.name, hidden: m.hidden, hours: totalMs(hs) / 3_600_000, eventsAttended: attended.size, attendanceRate: attendanceRate(attended.size, endedIds.size) };
  });
  return { all, endedEvents: endedIds.size };
}

/** Everyone on the board with their numbers. Opted-out members are dropped here, so they can never leak to the page. */
export async function leaderboardEntries(seasonId: string, now: Date = new Date()): Promise<{ entries: Entry[]; endedEvents: number }> {
  const { all, endedEvents } = await computeAll(seasonId, now);
  return { entries: all.filter((e) => !e.hidden).map(({ hidden: _hidden, ...e }) => e), endedEvents };
}

/** The viewer's own numbers, shown even when they've hidden themselves from the board. */
export async function myStats(userId: string, seasonId: string, now: Date = new Date()): Promise<Entry | null> {
  const { all } = await computeAll(seasonId, now);
  const me = all.find((e) => e.userId === userId);
  if (!me) return null;
  const { hidden: _hidden, ...entry } = me;
  return entry;
}
