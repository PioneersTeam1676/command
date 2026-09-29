import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teamSettings } from "@/db/schema";

export type TeamSettings = typeof teamSettings.$inferSelect;

/** Read (creating on first use) the single team_settings row. Cached per request. */
export const getSettings = cache(async (): Promise<TeamSettings> => readSettings());

export async function readSettings(): Promise<TeamSettings> {
  const [row] = await db.select().from(teamSettings).where(eq(teamSettings.id, 1));
  if (row) return row;
  await db.insert(teamSettings).values({ id: 1 }).onConflictDoNothing();
  const [created] = await db.select().from(teamSettings).where(eq(teamSettings.id, 1));
  return created!;
}

export async function isSetupComplete(): Promise<boolean> {
  return (await readSettings()).setupCompletedAt !== null;
}

export async function updateSettings(patch: Partial<typeof teamSettings.$inferInsert>) {
  await db.update(teamSettings).set(patch).where(eq(teamSettings.id, 1));
}
