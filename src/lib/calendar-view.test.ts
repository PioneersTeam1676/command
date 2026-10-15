import { describe, expect, it } from "vitest";
import { agendaEntries, calendarRange } from "./calendar-view";
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

describe("agenda range", () => {
  it("starts on the requested day and runs 120 days from it", () => {
    for (const tz of ["America/New_York", "Asia/Tokyo"]) {
      const range = calendarRange("agenda", "2026-10-21", tz);
      expect(range.view).toBe("agenda");
      expect(range.date).toBe("2026-10-21");
      expect(localDateOf(range.from, tz)).toBe("2026-10-21");
      expect(daysBetween("2026-10-21", localDateOf(range.to, tz))).toBe(120);
    }
  });
  it("falls back to today for a missing or invalid date", () => {
    const today = calendarRange("agenda", undefined, "America/New_York");
    expect(calendarRange("agenda", "not-a-date", "America/New_York").date).toBe(today.date);
  });
});

describe("agendaEntries", () => {
  const TZ = "America/New_York";
  const ev = (id: string, start: string, end: string) => ({ id, startsAt: new Date(start), endsAt: new Date(end) });
  const byDay = (...events: ReturnType<typeof ev>[]) => {
    const m = new Map<string, typeof events>();
    for (const e of events) m.set(localDateOf(e.startsAt, TZ), [...(m.get(localDateOf(e.startsAt, TZ)) ?? []), e]);
    return m;
  };

  it("adds an empty section for a picked day with nothing on it, in date order", () => {
    const m = byDay(ev("a", "2026-10-20T15:00:00Z", "2026-10-20T16:00:00Z"), ev("b", "2026-10-24T15:00:00Z", "2026-10-24T16:00:00Z"));
    const days = agendaEntries(m, "2026-10-22", "2026-10-14", [...m.values()].flat(), TZ).map(([d]) => d);
    expect(days).toEqual(["2026-10-20", "2026-10-22", "2026-10-24"]);
  });
  it("does not add an empty section when a multi-day event runs through the picked day", () => {
    const m = byDay(ev("fri-sun", "2026-10-23T14:00:00Z", "2026-10-25T20:00:00Z"));
    const days = agendaEntries(m, "2026-10-24", "2026-10-14", [...m.values()].flat(), TZ).map(([d]) => d);
    expect(days).toEqual(["2026-10-23"]);
  });
  it("adds nothing for today, or when the picked day already has events", () => {
    const m = byDay(ev("a", "2026-10-14T15:00:00Z", "2026-10-14T16:00:00Z"));
    expect(agendaEntries(m, "2026-10-14", "2026-10-14", [...m.values()].flat(), TZ).map(([d]) => d)).toEqual(["2026-10-14"]);
    expect(agendaEntries(new Map(), "2026-10-14", "2026-10-14", [], TZ)).toEqual([]);
  });
});
