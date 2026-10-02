/**
 * Offline clock taps carry the device timestamp (spec 6.7). The server accepts it only if it isn't
 * in the future (2 minute tolerance for clock drift) and isn't more than 24 hours old.
 */
export const FUTURE_TOLERANCE_MS = 2 * 60_000;
export const MAX_AGE_MS = 24 * 3_600_000;

export type ClientTimeCheck = { ok: true; time: Date } | { ok: false; reason: "invalid" | "future" | "too_old"; message: string };

export function validateClientTime(raw: string | number | Date | null | undefined, now: Date): ClientTimeCheck {
  const time = raw instanceof Date ? raw : new Date(raw ?? NaN);
  if (Number.isNaN(time.getTime())) return { ok: false, reason: "invalid", message: "That time isn't valid." };
  if (time.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return { ok: false, reason: "future", message: "That tap is dated in the future. Check your phone's clock." };
  }
  if (now.getTime() - time.getTime() > MAX_AGE_MS) {
    return { ok: false, reason: "too_old", message: "That tap is over 24 hours old. Ask a lead to add your time." };
  }
  return { ok: true, time };
}
