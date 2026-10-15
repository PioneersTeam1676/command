import { formatInTz } from "@/lib/time";

/**
 * Entries that look wrong at a glance, so a lead can check them: a clock-out at 3am, a day that ran far too long, or a
 * session left running. Computed from the times, never stored. Hours counting is unaffected; this only asks a human to look.
 */
export type AttendanceFlag = "unusual_hours" | "very_long" | "auto_closed" | "still_running";

/** Local time between 11pm (inclusive) and 5am (exclusive) is "unusual hours". */
export const QUIET_FROM_HOUR = 23;
export const QUIET_UNTIL_HOUR = 5;
/** Past an ordinary long build-season day (9am to 8pm is 11 hours), so the flag means something. */
export const VERY_LONG_MS = 12 * 3_600_000;
export const STILL_RUNNING_MS = 12 * 3_600_000;

export const FLAG_LABEL: Record<AttendanceFlag, string> = {
  unusual_hours: "Unusual hours",
  very_long: "Very long",
  auto_closed: "Auto clocked out",
  still_running: "Still running",
};

type FlagInput = { clockInAt: Date; clockOutAt: Date | null; status: string; reviewState: string };

const isQuiet = (d: Date, tz: string) => {
  const h = Number(formatInTz(d, tz, "H"));
  return h >= QUIET_FROM_HOUR || h < QUIET_UNTIL_HOUR;
};

export function attendanceFlags(s: FlagInput, tz: string, now: Date): AttendanceFlag[] {
  const flags: AttendanceFlag[] = [];
  if (isQuiet(s.clockInAt, tz) || (s.clockOutAt && isQuiet(s.clockOutAt, tz))) flags.push("unusual_hours");
  if (s.clockOutAt && s.clockOutAt.getTime() - s.clockInAt.getTime() > VERY_LONG_MS) flags.push("very_long");
  if (s.status === "auto_closed") flags.push("auto_closed");
  if (s.status === "open" && now.getTime() - s.clockInAt.getTime() >= STILL_RUNNING_MS) flags.push("still_running");
  return flags;
}

/**
 * True when a lead should look at it and nobody has yet. Auto clock-outs and running sessions already have their own
 * places to be handled, and approved or rejected entries have been looked at.
 */
export function needsAttention(s: FlagInput, tz: string, now: Date): boolean {
  if (s.reviewState !== "none") return false;
  return attendanceFlags(s, tz, now).some((f) => f === "unusual_hours" || f === "very_long");
}
