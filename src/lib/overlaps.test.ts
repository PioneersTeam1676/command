import { describe, expect, it } from "vitest";
import { findOverlapPairs, overlappingIds, type OverlapRow } from "./overlaps";

const T = (s: string) => new Date(`2026-01-12T${s}:00Z`);
const row = (id: string, from: string, to: string | null, extra: Partial<OverlapRow> = {}): OverlapRow => ({ id, userId: "u1", clockInAt: T(from), clockOutAt: to ? T(to) : null, reviewState: "none", ...extra });

describe("findOverlapPairs", () => {
  it("finds a clock-in that contains an event check-in", () => {
    const pairs = findOverlapPairs([row("open", "15:00", "19:00"), row("event", "16:00", "18:00")]);
    expect(pairs.map((p) => [p.a.id, p.b.id])).toEqual([["open", "event"]]);
  });

  it("treats touching end-to-start as no overlap", () => {
    expect(findOverlapPairs([row("a", "15:00", "16:00"), row("b", "16:00", "17:00")])).toEqual([]);
  });

  it("ignores rejected entries and other people", () => {
    expect(findOverlapPairs([row("a", "15:00", "17:00"), row("b", "16:00", "18:00", { reviewState: "rejected" })])).toEqual([]);
    expect(findOverlapPairs([row("a", "15:00", "17:00"), row("b", "16:00", "18:00", { userId: "u2" })])).toEqual([]);
  });

  it("includes pending entries and running sessions (ends now)", () => {
    const now = T("17:00");
    expect(overlappingIds([row("a", "15:00", null), row("b", "16:00", "16:30", { reviewState: "pending_approval" })], now)).toEqual(new Set(["a", "b"]));
  });

  it("reports every pair in a three-way overlap, and not the loner", () => {
    const ids = findOverlapPairs([row("a", "10:00", "14:00"), row("b", "11:00", "12:00"), row("c", "13:00", "15:00"), row("d", "20:00", "21:00")]).map((p) => `${p.a.id}${p.b.id}`);
    expect(ids).toEqual(["ab", "ac"]);
    expect(ids).not.toContain("d");
  });
});
