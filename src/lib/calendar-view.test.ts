import { describe, expect, it } from "vitest";
import { calendarRange } from "./calendar-view";
import { daysBetween, localDateOf } from "./time";

describe("month calendar range", () => {
  it.each([
    ["2026-02-01", "2026-02-01", "2026-03-01", 28],
    ["2026-09-29", "2026-08-30", "2026-10-04", 35],
    ["2026-08-01", "2026-07-26", "2026-09-06", 42],
    ["2024-02-29", "2024-01-28", "2024-03-03", 35],
    ["2026-03-01", "2026-03-01", "2026-04-05", 35],
    ["2026-12-01", "2026-11-29", "2027-01-03", 35],
  ])("shows only complete weeks covering %s", (date, start, end, days) => {
    for (const tz of ["America/New_York", "Asia/Tokyo"]) {
      const range = calendarRange("month", date, tz);
      expect(range.gridStart).toBe(start);
      expect(localDateOf(range.from, tz)).toBe(start);
      expect(localDateOf(range.to, tz)).toBe(end);
      expect(daysBetween(range.gridStart, localDateOf(range.to, tz))).toBe(days);
    }
  });
});
