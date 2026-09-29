import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { attendanceSessions, events, memberDays, rsvps, users } from "@/db/schema";
import { autoCloseAt } from "@/lib/attendance";
import { notify } from "@/lib/notify";
import { getCurrentSeason } from "@/lib/seasons";
import { getSettings } from "@/lib/settings";
import { isBuildWorkday, localDateOf, localToUtc, weekdayOf } from "@/lib/time";

const DAILY_WINDOW_MS = 2 * 3_600_000;
const CHECKIN_PROMPT_WINDOW_MS = 20 * 60_000;

export type ReminderSummary = Record<"daily" | "clockout" | "eventReminder" | "eventCheckin" | "eventCheckout", number>;

/**
 * Scheduled reminders (spec 7.2/7.3). Called from the `reminders.tick` job every minute. Each send is
 * keyed in `notification_log` so ticks can overlap, repeat or restart without ever double-sending.
 * "Workdays" come from the season's build range; people can opt out of individual workdays
 * (`member_days`). Nobody is reminded to clock in if they already have.
 */
export async function runReminders(now: Date = new Date()): Promise<ReminderSummary> {
  const out: ReminderSummary = { daily: 0, clockout: 0, eventReminder: 0, eventCheckin: 0, eventCheckout: 0 };
  const settings = await getSettings();
  const tz = settings.timezone;
  const season = await getCurrentSeason().catch(() => null);
  const today = localDateOf(now, tz);

  const active = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.status, "active"), inArray(users.role, ["member", "lead", "admin"])));
  const activeIds = active.map((u) => u.id);

  if (season && activeIds.length && isBuildWorkday(today, season)) {
    const weekday = weekdayOf(today);
    const cutoff = autoCloseAt(today, settings);

    // --- Daily clock-in reminder
    const dailyStart = localToUtc(today, settings.dailyReminderTime.slice(0, 5), tz);
    const dailyEnd = new Date(Math.min(dailyStart.getTime() + DAILY_WINDOW_MS, cutoff.getTime()));
    if (now >= dailyStart && now < dailyEnd) {
      const optedOut = new Set(
        (await db.select({ userId: memberDays.userId }).from(memberDays).where(and(eq(memberDays.weekday, weekday), eq(memberDays.attending, false)))).map((r) => r.userId),
      );
      const already = new Set(
        (await db.select({ userId: attendanceSessions.userId }).from(attendanceSessions).where(and(eq(attendanceSessions.kind, "open"), eq(attendanceSessions.localDate, today)))).map((r) => r.userId),
      );
      const targets = activeIds.filter((id) => !optedOut.has(id) && !already.has(id));
      out.daily = await notify({ userIds: targets, type: "daily_reminder", title: "Time to clock in", body: "It's a build season workday. Tap to clock in.", url: "/", dedupeKey: `daily:${today}` });
    }

    // --- Clock-out reminder: anyone still clocked in (open clock-in) this evening
    const outStart = localToUtc(today, settings.clockoutReminderTime.slice(0, 5), tz);
    if (now >= outStart && now < cutoff) {
      const stillIn = await db
        .select({ userId: attendanceSessions.userId })
        .from(attendanceSessions)
        .where(and(eq(attendanceSessions.kind, "open"), eq(attendanceSessions.status, "open")));
      const targets = stillIn.map((r) => r.userId).filter((id) => activeIds.includes(id));
      out.clockout = await notify({
        userIds: targets,
        type: "clockout_reminder",
        title: "Still clocked in?",
        body: `Tap to clock out. We'll do it for you automatically at ${settings.autoClockoutTime.slice(0, 5)}.`,
        url: "/",
        dedupeKey: `clockout:${today}`,
      });
    }
  }

  // --- Event-driven reminders (not tied to workdays: they follow the event)
  const grace = settings.eventAutocloseGraceMinutes * 60_000;
  const lead = settings.eventReminderMinutesBefore * 60_000;
  const nearby = await db
    .select()
    .from(events)
    .where(and(isNull(events.cancelledAt), lte(events.startsAt, new Date(now.getTime() + lead)), gte(events.endsAt, new Date(now.getTime() - grace))));

  for (const e of nearby) {
    const answered = await db
      .select({ userId: rsvps.userId })
      .from(rsvps)
      .where(and(eq(rsvps.eventId, e.id), inArray(rsvps.response, ["going", "maybe"])));
    const coming = answered.map((r) => r.userId).filter((id) => activeIds.includes(id));

    if (now >= new Date(e.startsAt.getTime() - lead) && now < e.startsAt) {
      out.eventReminder += await notify({
        userIds: coming,
        type: "event_reminder",
        title: `${e.title} is coming up`,
        body: `Starts in about ${Math.max(1, Math.round((e.startsAt.getTime() - now.getTime()) / 60_000))} minutes.`,
        url: `/calendar/${e.id}`,
        dedupeKey: `event-reminder:${e.id}`,
      });
    }

    const sessions = await db.select().from(attendanceSessions).where(and(eq(attendanceSessions.eventId, e.id), eq(attendanceSessions.kind, "event")));
    if (now >= e.startsAt && now < new Date(e.startsAt.getTime() + CHECKIN_PROMPT_WINDOW_MS)) {
      const checkedIn = new Set(sessions.map((s) => s.userId));
      out.eventCheckin += await notify({
        userIds: coming.filter((id) => !checkedIn.has(id)),
        type: "event_checkin_prompt",
        title: `${e.title} has started`,
        body: "Tap to check in.",
        url: `/checkin/${e.id}`,
        dedupeKey: `event-in:${e.id}`,
      });
    }

    if (now >= e.endsAt && now < new Date(e.endsAt.getTime() + grace)) {
      const stillIn = sessions.filter((s) => s.status === "open").map((s) => s.userId);
      out.eventCheckout += await notify({
        userIds: stillIn,
        type: "event_checkout_prompt",
        title: `${e.title} is over`,
        body: "Tap to clock out.",
        url: "/",
        dedupeKey: `event-out:${e.id}`,
      });
    }
  }
  return out;
}
