import { and, asc, eq, gt, gte, inArray, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { attendanceSessions, events } from "@/db/schema";
import { EVENT_CLOCKIN_LEAD_MS, autoCloseAt, effectiveVerification } from "@/lib/attendance";
import { myAttending } from "@/lib/attend";
import type { EventRow } from "@/lib/events";
import { getCurrentSeason } from "@/lib/seasons";
import { getSettings } from "@/lib/settings";
import { endOfLocalDay, inBuildSeason, isBuildWorkday, localDateOf, startOfLocalDay } from "@/lib/time";

export type EventCard = {
  event: EventRow;
  /** True when this person has signed up to attend. */
  going: boolean;
  verification: "none" | "code";
  /** Can the member check in right now (window open, not cancelled)? */
  canCheckIn: boolean;
  session?: { id: string; clockInAt: Date; clockOutAt: Date | null; status: string };
};

export type HomeData = {
  tz: string;
  today: string;
  buildDay: boolean;
  workday: boolean;
  /** Outside build season or past the cutoff: clocking in still works, but a lead has to approve the time. */
  offHours: boolean;
  /** Team setting: whether members see the off-hours warning at all. */
  showOffHoursNotice: boolean;
  clockoutNote: "off" | "optional" | "required";
  openSession: { id: string; clockInAt: Date } | null;
  cutoffLabelAt: Date;
  todayEvents: EventCard[];
  upcoming: EventCard[];
};

/** Everything the Home screen needs, computed in the team timezone. */
export async function getHomeData(userId: string, now: Date = new Date()): Promise<HomeData> {
  const settings = await getSettings();
  const tz = settings.timezone;
  const season = await getCurrentSeason();
  const today = localDateOf(now, tz);
  const cutoff = autoCloseAt(today, settings);
  const buildDay = inBuildSeason(today, season);

  const [stillOpen] = await db
    .select()
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.userId, userId), eq(attendanceSessions.kind, "open"), eq(attendanceSessions.status, "open")));

  const dayStart = startOfLocalDay(today, tz);
  const dayEnd = endOfLocalDay(today, tz);
  const windowEvents = await db
    .select()
    .from(events)
    .where(or(and(gte(events.startsAt, dayStart), lt(events.startsAt, dayEnd)), and(lt(events.startsAt, dayStart), gt(events.endsAt, now))))
    .orderBy(asc(events.startsAt));
  const upcomingEvents = await db.select().from(events).where(and(gte(events.startsAt, dayEnd))).orderBy(asc(events.startsAt)).limit(5);

  const all = [...windowEvents, ...upcomingEvents];
  const ids = all.map((e) => e.id);
  const [attending, sessions] = await Promise.all([
    myAttending(userId, ids),
    ids.length
      ? db.select().from(attendanceSessions).where(and(eq(attendanceSessions.userId, userId), inArray(attendanceSessions.eventId, ids)))
      : Promise.resolve([]),
  ]);
  const sessionByEvent = new Map(sessions.map((s) => [s.eventId, s]));

  const card = (e: EventRow): EventCard => {
    const s = sessionByEvent.get(e.id);
    const opens = e.startsAt.getTime() - EVENT_CLOCKIN_LEAD_MS;
    return {
      event: e,
      going: attending.has(e.id),
      verification: effectiveVerification(e, settings),
      canCheckIn: !e.cancelledAt && now.getTime() >= opens && now < e.endsAt,
      session: s ? { id: s.id, clockInAt: s.clockInAt, clockOutAt: s.clockOutAt, status: s.status } : undefined,
    };
  };

  return {
    tz,
    today,
    buildDay,
    workday: isBuildWorkday(today, season),
    offHours: !buildDay || now >= cutoff,
    showOffHoursNotice: settings.showOffHoursNotice,
    clockoutNote: !settings.clockoutNoteEnabled ? "off" : settings.clockoutNoteRequired ? "required" : "optional",
    openSession: stillOpen ? { id: stillOpen.id, clockInAt: stillOpen.clockInAt } : null,
    cutoffLabelAt: cutoff,
    todayEvents: windowEvents.map(card),
    upcoming: upcomingEvents.map(card),
  };
}
