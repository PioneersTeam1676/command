import { describe, expect, it } from "vitest";
import { attendanceRate, rankEntries, type Entry } from "./leaderboard";

const e = (name: string, hours: number, attended: number, ended: number): Entry => ({ userId: name, name, hours, eventsAttended: attended, attendanceRate: attendanceRate(attended, ended) });

describe("attendanceRate", () => {
  it("is attended / ended events", () => expect(attendanceRate(3, 4)).toBe(0.75));
  it("is null when nothing has ended yet", () => expect(attendanceRate(0, 0)).toBeNull());
  it("never exceeds 100%", () => expect(attendanceRate(5, 4)).toBe(1));
});

describe("rankEntries", () => {
  it("ranks by hours, descending, with ties sharing a rank", () => {
    const r = rankEntries([e("Ann", 10, 0, 4), e("Bob", 12, 0, 4), e("Cat", 10, 0, 4), e("Dan", 3, 0, 4)], "hours");
    expect(r.map((x) => [x.name, x.rank])).toEqual([["Bob", 1], ["Ann", 2], ["Cat", 2], ["Dan", 4]]);
  });
  it("ties are decided at display precision (one decimal for hours)", () => {
    const r = rankEntries([e("A", 12.004, 0, 1), e("B", 12.001, 0, 1)], "hours");
    expect(r.map((x) => x.rank)).toEqual([1, 1]);
  });
  it("ranks by attendance rate and puts people with no rate last, unranked", () => {
    const r = rankEntries([e("Ann", 1, 2, 4), e("Bob", 1, 4, 4), e("Cat", 1, 0, 0)], "attendance");
    expect(r.map((x) => [x.name, x.rank])).toEqual([["Bob", 1], ["Ann", 2], ["Cat", 0]]);
    expect(r[2]!.value).toBeNull();
  });
  it("is stable: equal values sort by name", () => {
    const r = rankEntries([e("Zed", 5, 0, 1), e("Amy", 5, 0, 1)], "hours");
    expect(r.map((x) => x.name)).toEqual(["Amy", "Zed"]);
  });
  it("handles an empty board", () => expect(rankEntries([], "hours")).toEqual([]));
  it("the two tabs can order people differently", () => {
    const list = [e("Ann", 20, 1, 4), e("Bob", 5, 4, 4)];
    expect(rankEntries(list, "hours")[0]!.name).toBe("Ann");
    expect(rankEntries(list, "attendance")[0]!.name).toBe("Bob");
  });
});
