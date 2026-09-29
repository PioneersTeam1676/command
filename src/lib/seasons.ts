import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { events } from "@/db/schema";
import { db } from "@/db";
import { seasons } from "@/db/schema";
import { audit } from "@/lib/audit";
import { addDaysLocal, isLocalDate, startOfLocalDay, todayLocal } from "@/lib/time";
import { readSettings } from "@/lib/settings";

export type Season = typeof seasons.$inferSelect;

export async function getCurrentSeason(): Promise<Season> {
  const [s] = await db.select().from(seasons).where(eq(seasons.isCurrent, true));
  if (!s) throw new Error("No current season. Setup has not completed.");
  return s;
}

export async function listSeasons(): Promise<Season[]> {
  return db.select().from(seasons).orderBy(desc(seasons.startDate));
}

export async function getSeason(id: string): Promise<Season | undefined> {
  const [s] = await db.select().from(seasons).where(eq(seasons.id, id));
  return s;
}

/** The season whose date range contains `localDate`; falls back to the current season. */
export async function seasonForDate(localDate: string): Promise<Season> {
  const [s] = await db
    .select()
    .from(seasons)
    .where(and(lte(seasons.startDate, localDate), or(isNull(seasons.endDate), gte(seasons.endDate, localDate))))
    .orderBy(desc(seasons.startDate))
    .limit(1);
  return s ?? (await getCurrentSeason());
}

export async function firstSeasonStart(): Promise<string | null> {
  const [s] = await db.select({ d: seasons.startDate }).from(seasons).orderBy(asc(seasons.startDate)).limit(1);
  return s?.d ?? null;
}

export type SeasonInput = { name: string; buildStart: string | null; buildEnd: string | null; workdays: number[] };

export function validateSeasonInput(input: SeasonInput): string | null {
  if (!input.name.trim()) return "Give the season a name.";
  if ((input.buildStart === null) !== (input.buildEnd === null)) return "Set both the first and last day of build season, or leave both empty.";
  if (input.buildStart && input.buildEnd) {
    if (!isLocalDate(input.buildStart) || !isLocalDate(input.buildEnd)) return "Enter valid dates.";
    if (input.buildEnd < input.buildStart) return "Build season can't end before it starts.";
  }
  if (input.workdays.length === 0) return "Pick at least one workday.";
  if (input.workdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "Workdays must be days of the week.";
  return null;
}

export async function updateCurrentSeason(actorId: string, input: SeasonInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const error = validateSeasonInput(input);
  if (error) return { ok: false, error };
  const before = await getCurrentSeason();
  const workdays = [...new Set(input.workdays)].sort();
  await db.transaction(async (tx) => {
    await tx.update(seasons).set({ name: input.name.trim(), buildStart: input.buildStart, buildEnd: input.buildEnd, workdays }).where(eq(seasons.id, before.id));
    await audit(
      {
        actorId,
        action: "season.update",
        targetType: "season",
        targetId: before.id,
        before: { name: before.name, buildStart: before.buildStart, buildEnd: before.buildEnd, workdays: before.workdays },
        after: { name: input.name.trim(), buildStart: input.buildStart, buildEnd: input.buildEnd, workdays },
      },
      tx,
    );
  });
  return { ok: true };
}

export type NewSeasonInput = { name: string; startDate: string; buildStart: string | null; buildEnd: string | null; workdays: number[] };

/**
 * Archive the current season and start a new one. Nothing is deleted: the old season keeps its hours,
 * attendance and leaderboard, and stays viewable and exportable. Future events already on the calendar
 * move into the new season so they count there.
 */
export async function startNewSeason(actorId: string, input: NewSeasonInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const settings = await readSettings();
  const today = todayLocal(settings.timezone);
  const current = await getCurrentSeason();
  const err = validateSeasonInput({ name: input.name, buildStart: input.buildStart, buildEnd: input.buildEnd, workdays: input.workdays });
  if (err) return { ok: false, error: err };
  if (!isLocalDate(input.startDate)) return { ok: false, error: "Choose a start date." };
  if (input.startDate > today) return { ok: false, error: "A new season starts today or earlier. You can't start one in the future." };
  if (input.startDate < current.startDate) return { ok: false, error: `The new season can't start before the current one began (${current.startDate}).` };
  // Day before the new season, but never before the old season's own first day (same-day starts end it that day).
  const dayBefore = addDaysLocal(input.startDate, -1);
  const oldEnd = dayBefore < current.startDate ? current.startDate : dayBefore;

  const id = await db.transaction(async (tx) => {
    await tx.update(seasons).set({ isCurrent: false, endDate: oldEnd }).where(eq(seasons.id, current.id));
    const [created] = await tx
      .insert(seasons)
      .values({ name: input.name.trim(), startDate: input.startDate, isCurrent: true, buildStart: input.buildStart, buildEnd: input.buildEnd, workdays: [...new Set(input.workdays)].sort() })
      .returning({ id: seasons.id });
    await tx
      .update(events)
      .set({ seasonId: created!.id })
      .where(and(eq(events.seasonId, current.id), gte(events.startsAt, startOfLocalDay(input.startDate, settings.timezone))));
    await audit({ actorId, action: "season.start_new", targetType: "season", targetId: created!.id, before: { archived: current.name, endDate: oldEnd }, after: { name: input.name.trim(), startDate: input.startDate } }, tx);
    return created!.id;
  });
  return { ok: true, id };
}
