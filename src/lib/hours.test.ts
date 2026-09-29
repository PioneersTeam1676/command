import { describe, expect, it } from "vitest";
import { countsTowardHours, formatDuration, mergeIntervals, msByLocalDate, overlaps, totalHours, totalMs, totalMsBetween, type HoursSession } from "./hours";

const NY = "America/New_York";
const at = (s: string) => new Date(s);
const H = 3_600_000;

const s = (inAt: string, outAt: string | null, over: Partial<HoursSession> = {}): HoursSession => ({
  clockInAt: at(inAt),
  clockOutAt: outAt ? at(outAt) : null,
  status: "closed",
  reviewState: "none",
  ...over,
});

describe("what counts", () => {
  it("closed sessions count", () => expect(totalHours([s("2026-01-05T15:00:00Z", "2026-01-05T17:30:00Z")])).toBe(2.5));
  it("open sessions (no clock-out yet) do not count", () => expect(totalHours([s("2026-01-05T15:00:00Z", null, { status: "open" })])).toBe(0));
  it("auto-closed sessions count until rejected", () => {
    const auto = s("2026-01-05T15:00:00Z", "2026-01-06T02:00:00Z", { status: "auto_closed", reviewState: "needs_review" });
    expect(totalHours([auto])).toBe(11);
    expect(totalHours([{ ...auto, reviewState: "rejected" }])).toBe(0);
    expect(totalHours([{ ...auto, reviewState: "approved" }])).toBe(11);
  });
  it("edited sessions count with their edited end", () => {
    expect(totalHours([s("2026-01-05T15:00:00Z", "2026-01-05T18:00:00Z", { status: "edited", reviewState: "approved" })])).toBe(3);
  });
  it("rejected sessions never count", () => {
    expect(totalHours([s("2026-01-05T15:00:00Z", "2026-01-05T18:00:00Z", { reviewState: "rejected" })])).toBe(0);
  });
  it("pending backfill does not count, approved backfill does", () => {
    expect(countsTowardHours(s("2026-01-05T15:00:00Z", "2026-01-05T18:00:00Z", { reviewState: "pending_approval" }))).toBe(false);
    expect(countsTowardHours(s("2026-01-05T15:00:00Z", "2026-01-05T18:00:00Z", { reviewState: "approved" }))).toBe(true);
  });
  it("zero or negative length sessions are ignored", () => {
    expect(totalMs([s("2026-01-05T15:00:00Z", "2026-01-05T15:00:00Z"), s("2026-01-05T16:00:00Z", "2026-01-05T15:00:00Z")])).toBe(0);
  });
});

describe("overlap (union, never double count)", () => {
  it("partially overlapping open + event sessions", () => {
    // 3:00-6:00 open, 5:00-8:00 event -> 3:00-8:00 = 5h
    expect(totalHours([s("2026-01-05T15:00:00Z", "2026-01-05T18:00:00Z"), s("2026-01-05T17:00:00Z", "2026-01-05T20:00:00Z")])).toBe(5);
  });
  it("fully contained session adds nothing", () => {
    expect(totalHours([s("2026-01-05T15:00:00Z", "2026-01-05T21:00:00Z"), s("2026-01-05T17:00:00Z", "2026-01-05T18:00:00Z")])).toBe(6);
  });
  it("touching sessions join, disjoint ones add", () => {
    expect(totalHours([s("2026-01-05T15:00:00Z", "2026-01-05T16:00:00Z"), s("2026-01-05T16:00:00Z", "2026-01-05T17:00:00Z"), s("2026-01-05T19:00:00Z", "2026-01-05T20:00:00Z")])).toBe(3);
  });
  it("is independent of input order and doesn't mutate input", () => {
    const list = [s("2026-01-05T19:00:00Z", "2026-01-05T20:00:00Z"), s("2026-01-05T15:00:00Z", "2026-01-05T17:00:00Z")];
    const copy = [...list];
    expect(totalHours(list)).toBe(3);
    expect(list).toEqual(copy);
  });
  it("an ignored overlapping session (rejected) doesn't extend the union", () => {
    expect(totalHours([s("2026-01-05T15:00:00Z", "2026-01-05T16:00:00Z"), s("2026-01-05T15:30:00Z", "2026-01-05T22:00:00Z", { reviewState: "rejected" })])).toBe(1);
  });
  it("mergeIntervals merges chains", () => {
    const merged = mergeIntervals([
      [at("2026-01-01T01:00:00Z"), at("2026-01-01T03:00:00Z")],
      [at("2026-01-01T02:00:00Z"), at("2026-01-01T05:00:00Z")],
      [at("2026-01-01T04:00:00Z"), at("2026-01-01T06:00:00Z")],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]![1].toISOString()).toBe("2026-01-01T06:00:00.000Z");
  });
  it("overlaps helper: touching isn't overlapping", () => {
    expect(overlaps([at("2026-01-01T01:00:00Z"), at("2026-01-01T02:00:00Z")], [at("2026-01-01T02:00:00Z"), at("2026-01-01T03:00:00Z")])).toBe(false);
    expect(overlaps([at("2026-01-01T01:00:00Z"), at("2026-01-01T02:30:00Z")], [at("2026-01-01T02:00:00Z"), at("2026-01-01T03:00:00Z")])).toBe(true);
  });
});

describe("midnight crossing", () => {
  it("splits a session across local midnight (New York, EST)", () => {
    // 10 PM to 1 AM local = 3h: 2h on Jan 5, 1h on Jan 6.
    const days = msByLocalDate([s("2026-01-06T03:00:00Z", "2026-01-06T06:00:00Z")], NY);
    expect(days.get("2026-01-05")).toBe(2 * H);
    expect(days.get("2026-01-06")).toBe(1 * H);
  });
  it("total is unchanged by the split", () => {
    const sess = [s("2026-01-06T03:00:00Z", "2026-01-06T06:00:00Z")];
    const sum = [...msByLocalDate(sess, NY).values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(totalMs(sess));
  });
  it("a session spanning several days is split per day", () => {
    const days = msByLocalDate([s("2026-01-05T15:00:00Z", "2026-01-08T15:00:00Z")], NY);
    expect(days.size).toBe(4);
    expect(days.get("2026-01-06")).toBe(24 * H);
  });
  it("totalMsBetween clips to the window", () => {
    expect(totalMsBetween([s("2026-01-05T15:00:00Z", "2026-01-05T20:00:00Z")], at("2026-01-05T17:00:00Z"), at("2026-01-05T19:00:00Z"))).toBe(2 * H);
  });
});

describe("DST days", () => {
  it("a session over spring-forward (2 AM -> 3 AM skip) is 1 real hour, not 2", () => {
    // 1:00 AM EST to 4:00 AM EDT on 2026-03-08 = 2 real hours.
    const sess = [s("2026-03-08T06:00:00Z", "2026-03-08T08:00:00Z")];
    expect(totalHours(sess)).toBe(2);
    expect(msByLocalDate(sess, NY).get("2026-03-08")).toBe(2 * H);
  });
  it("splits correctly at midnight when the next day is the 23-hour day", () => {
    // 11 PM EST Mar 7 to 1 AM EST Mar 8 = 2h; 1h each side.
    const days = msByLocalDate([s("2026-03-08T04:00:00Z", "2026-03-08T06:00:00Z")], NY);
    expect(days.get("2026-03-07")).toBe(1 * H);
    expect(days.get("2026-03-08")).toBe(1 * H);
  });
  it("a full-day session on the 25-hour fall-back day counts 25h on that date", () => {
    const days = msByLocalDate([s("2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z")], NY);
    expect(days.get("2026-11-01")).toBe(25 * H);
  });
  it("a session over the fall-back hour counts both 1 AM hours", () => {
    // 12:30 AM EDT to 2:30 AM EST = 3 real hours.
    expect(totalHours([s("2026-11-01T04:30:00Z", "2026-11-01T07:30:00Z")])).toBe(3);
  });
});

describe("formatDuration", () => {
  it("formats", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(59 * 60_000)).toBe("59m");
    expect(formatDuration(3 * H + 5 * 60_000)).toBe("3h 05m");
  });
});
