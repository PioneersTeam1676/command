import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { seasons } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isLocalDate } from "@/lib/time";

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
