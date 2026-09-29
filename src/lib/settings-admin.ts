import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teamSettings } from "@/db/schema";
import { audit } from "@/lib/audit";
import { normalizeDomain } from "@/lib/auth/approval";
import { readSettings } from "@/lib/settings";

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isHHMM = (s: string) => HHMM.test(s);
const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** Parse a comma/space/newline separated list of domains. Returns the clean list or the first bad entry. */
export function parseDomains(input: string): { ok: true; domains: string[] } | { ok: false; bad: string } {
  const domains: string[] = [];
  for (const raw of input.split(/[\s,;]+/).filter(Boolean)) {
    const d = normalizeDomain(raw);
    if (!d) return { ok: false, bad: raw };
    if (!domains.includes(d)) domains.push(d);
  }
  return { ok: true, domains };
}

/** Reminders must come in a sensible order: clock-in reminder, then clock-out reminder, then the automatic clock-out. */
export function validateSchedule(s: { dailyReminderTime: string; clockoutReminderTime: string; autoClockoutTime: string }): string | null {
  if (![s.dailyReminderTime, s.clockoutReminderTime, s.autoClockoutTime].every(isHHMM)) return "Enter times like 15:30.";
  if (minutes(s.dailyReminderTime) >= minutes(s.clockoutReminderTime)) return "The clock-in reminder has to come before the clock-out reminder.";
  if (minutes(s.clockoutReminderTime) >= minutes(s.autoClockoutTime)) return "The clock-out reminder has to come before the automatic clock-out, so people get a chance to do it themselves.";
  return null;
}

type Patch = Partial<typeof teamSettings.$inferInsert>;

/** Apply a settings change and record exactly which fields changed. */
export async function updateTeamSettings(actorId: string, patch: Patch, action: string) {
  const before = await readSettings();
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const old = (before as Record<string, unknown>)[k];
    if (JSON.stringify(old) !== JSON.stringify(v)) {
      changedBefore[k] = old;
      changedAfter[k] = v;
    }
  }
  if (Object.keys(changedAfter).length === 0) return { changed: false as const };
  await db.transaction(async (tx) => {
    await tx.update(teamSettings).set(patch).where(eq(teamSettings.id, 1));
    await audit({ actorId, action, targetType: "team_settings", before: changedBefore, after: changedAfter }, tx);
  });
  return { changed: true as const, fields: Object.keys(changedAfter) };
}
