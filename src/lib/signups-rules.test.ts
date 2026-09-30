import { describe, expect, it } from "vitest";
import { roleFitsAudience, slotClosedReason, slotsOverlap } from "./signups-rules";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 6, 10, h, m));

describe("roleFitsAudience", () => {
  it("anyone takes everyone", () => {
    for (const r of ["member", "lead", "admin", "parent"] as const) expect(roleFitsAudience(r, "anyone")).toBe(true);
  });
  it("members-only excludes parents, includes leads and admins", () => {
    expect(roleFitsAudience("member", "members")).toBe(true);
    expect(roleFitsAudience("lead", "members")).toBe(true);
    expect(roleFitsAudience("admin", "members")).toBe(true);
    expect(roleFitsAudience("parent", "members")).toBe(false);
  });
  it("parents-only excludes staff and members", () => {
    expect(roleFitsAudience("parent", "parents")).toBe(true);
    expect(roleFitsAudience("member", "parents")).toBe(false);
    expect(roleFitsAudience("admin", "parents")).toBe(false);
  });
});

describe("slotsOverlap", () => {
  it("treats back-to-back shifts as not overlapping", () => {
    expect(slotsOverlap({ startsAt: at(9), endsAt: at(11) }, { startsAt: at(11), endsAt: at(13) })).toBe(false);
  });
  it("detects partial and contained overlap, both ways round", () => {
    expect(slotsOverlap({ startsAt: at(9), endsAt: at(11) }, { startsAt: at(10), endsAt: at(12) })).toBe(true);
    expect(slotsOverlap({ startsAt: at(10), endsAt: at(12) }, { startsAt: at(9), endsAt: at(11) })).toBe(true);
    expect(slotsOverlap({ startsAt: at(9), endsAt: at(15) }, { startsAt: at(10), endsAt: at(11) })).toBe(true);
  });
});

describe("slotClosedReason", () => {
  const slot = { startsAt: at(9), endsAt: at(11), cancelledAt: null };
  const open = { sheetClosedAt: null, eventCancelledAt: null };
  it("is open before the shift ends", () => {
    expect(slotClosedReason(slot, open, at(8))).toBeNull();
    expect(slotClosedReason(slot, open, at(10))).toBeNull();
  });
  it("closes once the shift is over", () => expect(slotClosedReason(slot, open, at(11))).toBe("slot_over"));
  it("reports the most specific reason first", () => {
    expect(slotClosedReason({ ...slot, cancelledAt: at(1) }, { sheetClosedAt: at(1), eventCancelledAt: null }, at(8))).toBe("slot_cancelled");
    expect(slotClosedReason(slot, { sheetClosedAt: at(1), eventCancelledAt: at(1) }, at(8))).toBe("event_cancelled");
    expect(slotClosedReason(slot, { sheetClosedAt: at(1), eventCancelledAt: null }, at(8))).toBe("sheet_closed");
  });
});
