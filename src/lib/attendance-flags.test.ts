import { describe, expect, it } from "vitest";
import { attendanceFlags, needsAttention } from "./attendance-flags";

const TZ = "America/New_York"; // EST in January: UTC-5
const T = (s: string) => new Date(s);
const NOW = T("2026-01-20T12:00:00Z");
const base = { status: "closed", reviewState: "none" };

describe("attendanceFlags", () => {
  it("is empty for an ordinary afternoon session", () => {
    expect(attendanceFlags({ ...base, clockInAt: T("2026-01-14T20:00:00Z"), clockOutAt: T("2026-01-14T23:00:00Z") }, TZ, NOW)).toEqual([]);
  });
  it("flags a clock-out at 3am local", () => {
    expect(attendanceFlags({ ...base, clockInAt: T("2026-01-14T20:00:00Z"), clockOutAt: T("2026-01-15T08:00:00Z") }, TZ, NOW)).toContain("unusual_hours");
  });
  it("flags a clock-in at 11:30pm local, and treats 5am as normal", () => {
    expect(attendanceFlags({ ...base, clockInAt: T("2026-01-15T04:30:00Z"), clockOutAt: T("2026-01-15T05:30:00Z") }, TZ, NOW)).toContain("unusual_hours");
    expect(attendanceFlags({ ...base, clockInAt: T("2026-01-15T10:00:00Z"), clockOutAt: T("2026-01-15T11:00:00Z") }, TZ, NOW)).not.toContain("unusual_hours");
  });
  it("uses the team timezone, not UTC", () => {
    // 03:00 UTC is 10pm in New York: fine. In Tokyo it is noon: fine. 08:00 UTC is 3am in New York.
    expect(attendanceFlags({ ...base, clockInAt: T("2026-01-15T02:00:00Z"), clockOutAt: T("2026-01-15T03:00:00Z") }, TZ, NOW)).not.toContain("unusual_hours");
    expect(attendanceFlags({ ...base, clockInAt: T("2026-01-15T07:00:00Z"), clockOutAt: T("2026-01-15T08:00:00Z") }, "Asia/Tokyo", NOW)).not.toContain("unusual_hours");
  });
  it("flags sessions over 12 hours, but not an ordinary long build-season day", () => {
    expect(attendanceFlags({ ...base, clockInAt: T("2026-01-14T14:00:00Z"), clockOutAt: T("2026-01-15T03:30:00Z") }, TZ, NOW)).toContain("very_long");
    expect(attendanceFlags({ ...base, clockInAt: T("2026-01-14T14:00:00Z"), clockOutAt: T("2026-01-15T01:30:00Z") }, TZ, NOW)).not.toContain("very_long"); // 11.5h, 9am to 8:30pm
  });
  it("flags automatic clock-outs", () => {
    expect(attendanceFlags({ status: "auto_closed", reviewState: "needs_review", clockInAt: T("2026-01-14T20:00:00Z"), clockOutAt: T("2026-01-14T23:00:00Z") }, TZ, NOW)).toContain("auto_closed");
  });
  it("flags a session that has been running over 12 hours", () => {
    expect(attendanceFlags({ status: "open", reviewState: "none", clockInAt: T("2026-01-20T00:00:00Z"), clockOutAt: null }, TZ, NOW)).toContain("still_running");
    expect(attendanceFlags({ status: "open", reviewState: "none", clockInAt: T("2026-01-20T10:00:00Z"), clockOutAt: null }, TZ, NOW)).not.toContain("still_running");
  });
});

describe("needsAttention", () => {
  const odd = { clockInAt: T("2026-01-14T20:00:00Z"), clockOutAt: T("2026-01-15T08:00:00Z") };
  it("is true for an unreviewed unusual entry", () => {
    expect(needsAttention({ ...base, ...odd }, TZ, NOW)).toBe(true);
  });
  it("is false once a lead has approved it, or when it was rejected", () => {
    expect(needsAttention({ status: "edited", reviewState: "approved", ...odd }, TZ, NOW)).toBe(false);
    expect(needsAttention({ status: "closed", reviewState: "rejected", ...odd }, TZ, NOW)).toBe(false);
  });
  it("leaves auto clock-outs to the existing review queue", () => {
    expect(needsAttention({ status: "auto_closed", reviewState: "needs_review", clockInAt: T("2026-01-14T20:00:00Z"), clockOutAt: T("2026-01-14T23:00:00Z") }, TZ, NOW)).toBe(false);
  });
});
