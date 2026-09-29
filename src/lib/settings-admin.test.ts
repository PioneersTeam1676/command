import { describe, expect, it } from "vitest";
import { parseDomains, validateSchedule } from "./settings-admin";

describe("parseDomains", () => {
  it("normalizes, dedupes and accepts mixed separators", () => {
    expect(parseDomains("School.edu, @team.org  school.edu\nother.io")).toEqual({ ok: true, domains: ["school.edu", "team.org", "other.io"] });
  });
  it("returns the first bad entry", () => {
    expect(parseDomains("ok.com, *.bad.com")).toEqual({ ok: false, bad: "*.bad.com" });
    expect(parseDomains("nodot")).toEqual({ ok: false, bad: "nodot" });
  });
  it("empty is fine (no auto-approval)", () => expect(parseDomains("")).toEqual({ ok: true, domains: [] }));
});

describe("validateSchedule", () => {
  const ok = { dailyReminderTime: "15:30", clockoutReminderTime: "20:30", autoClockoutTime: "21:00" };
  it("accepts the defaults", () => expect(validateSchedule(ok)).toBeNull());
  it("requires clock-in reminder before clock-out reminder", () => expect(validateSchedule({ ...ok, dailyReminderTime: "20:30" })).toContain("before the clock-out reminder"));
  it("requires clock-out reminder before the automatic clock-out", () => expect(validateSchedule({ ...ok, clockoutReminderTime: "21:00" })).toContain("before the automatic clock-out"));
  it("rejects malformed times", () => expect(validateSchedule({ ...ok, autoClockoutTime: "9pm" })).toContain("15:30"));
});
