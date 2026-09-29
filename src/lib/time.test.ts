import { describe, expect, it } from "vitest";
import {
  addDaysLocal,
  addMonthsLocal,
  daysBetween,
  endOfLocalDay,
  fromDatetimeLocal,
  inBuildSeason,
  isBuildWorkday,
  localDateOf,
  localToUtc,
  startOfLocalDay,
  startOfWeekLocal,
  toDatetimeLocal,
  weekdayOf,
} from "./time";

const NY = "America/New_York";
const hoursBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

describe("local dates", () => {
  it("uses the team timezone, not UTC, for 'today'", () => {
    // 2026-01-16 03:30Z is still Jan 15, 22:30 in New York.
    expect(localDateOf(new Date("2026-01-16T03:30:00Z"), NY)).toBe("2026-01-15");
    expect(localDateOf(new Date("2026-01-16T03:30:00Z"), "Asia/Tokyo")).toBe("2026-01-16");
  });
  it("handles midnight boundaries exactly", () => {
    expect(localDateOf(new Date("2026-01-16T04:59:59Z"), NY)).toBe("2026-01-15");
    expect(localDateOf(new Date("2026-01-16T05:00:00Z"), NY)).toBe("2026-01-16");
  });
});

describe("DST", () => {
  it("spring forward day is 23 hours long", () => {
    expect(hoursBetween(startOfLocalDay("2026-03-08", NY), endOfLocalDay("2026-03-08", NY))).toBe(23);
  });
  it("fall back day is 25 hours long", () => {
    expect(hoursBetween(startOfLocalDay("2026-11-01", NY), endOfLocalDay("2026-11-01", NY))).toBe(25);
  });
  it("ordinary day is 24 hours", () => {
    expect(hoursBetween(startOfLocalDay("2026-06-10", NY), endOfLocalDay("2026-06-10", NY))).toBe(24);
  });
  it("9 PM stays 9 PM local on both sides of a change", () => {
    expect(localToUtc("2026-03-07", "21:00", NY).toISOString()).toBe("2026-03-08T02:00:00.000Z"); // EST
    expect(localToUtc("2026-03-09", "21:00", NY).toISOString()).toBe("2026-03-10T01:00:00.000Z"); // EDT
  });
  it("a time that doesn't exist (2:30 AM on spring-forward) lands on a real instant that day", () => {
    const d = localToUtc("2026-03-08", "02:30", NY);
    expect(localDateOf(d, NY)).toBe("2026-03-08");
  });
  it("an ambiguous time (1:30 AM on fall-back) resolves to one of the two valid instants", () => {
    const d = localToUtc("2026-11-01", "01:30", NY).toISOString();
    expect(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]).toContain(d);
  });
  it("round-trips datetime-local values", () => {
    const d = fromDatetimeLocal("2026-06-10T18:45", NY);
    expect(toDatetimeLocal(d, NY)).toBe("2026-06-10T18:45");
    expect(d.toISOString()).toBe("2026-06-10T22:45:00.000Z");
  });
  it("rejects garbage", () => {
    expect(() => fromDatetimeLocal("tomorrow", NY)).toThrow();
    expect(() => localToUtc("2026-02-30x", "10:00", NY)).toThrow();
    expect(() => localToUtc("2026-06-10", "25:00", NY)).toThrow();
  });
});

describe("plain date arithmetic", () => {
  it("adds days across month/year boundaries", () => {
    expect(addDaysLocal("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysLocal("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysLocal("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("weekday, week start, month math", () => {
    expect(weekdayOf("2026-01-04")).toBe(0); // Sunday
    expect(startOfWeekLocal("2026-01-07")).toBe("2026-01-04");
    expect(startOfWeekLocal("2026-01-07", 1)).toBe("2026-01-05");
    expect(addMonthsLocal("2026-01-31", 1)).toBe("2026-02-01");
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
  });
});

describe("build season", () => {
  const season = { buildStart: "2026-01-03", buildEnd: "2026-02-18", workdays: [1, 2, 3, 4, 5] };
  it("range is inclusive on both ends", () => {
    expect(inBuildSeason("2026-01-03", season)).toBe(true);
    expect(inBuildSeason("2026-02-18", season)).toBe(true);
    expect(inBuildSeason("2026-01-02", season)).toBe(false);
    expect(inBuildSeason("2026-02-19", season)).toBe(false);
  });
  it("workdays exclude weekends but open clock-in range still includes them", () => {
    expect(isBuildWorkday("2026-01-05", season)).toBe(true); // Monday
    expect(isBuildWorkday("2026-01-10", season)).toBe(false); // Saturday
    expect(inBuildSeason("2026-01-10", season)).toBe(true);
  });
  it("no build range means no build season", () => {
    expect(inBuildSeason("2026-01-05", { buildStart: null, buildEnd: null, workdays: [1] })).toBe(false);
  });
});
