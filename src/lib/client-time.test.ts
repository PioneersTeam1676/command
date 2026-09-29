import { describe, expect, it } from "vitest";
import { validateClientTime } from "./client-time";

const now = new Date("2026-01-05T20:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("offline timestamp validation", () => {
  it("accepts a recent past time", () => expect(validateClientTime(ago(60_000), now).ok).toBe(true));
  it("accepts up to 2 minutes in the future (clock drift)", () => {
    expect(validateClientTime(new Date(now.getTime() + 119_000), now).ok).toBe(true);
    expect(validateClientTime(new Date(now.getTime() + 120_000), now).ok).toBe(true);
  });
  it("rejects more than 2 minutes in the future", () => {
    const r = validateClientTime(new Date(now.getTime() + 121_000), now);
    expect(r).toMatchObject({ ok: false, reason: "future" });
  });
  it("accepts exactly 24 hours old, rejects older", () => {
    expect(validateClientTime(ago(24 * 3_600_000), now).ok).toBe(true);
    expect(validateClientTime(ago(24 * 3_600_000 + 1), now)).toMatchObject({ ok: false, reason: "too_old" });
  });
  it("rejects garbage", () => {
    expect(validateClientTime("banana", now)).toMatchObject({ ok: false, reason: "invalid" });
    expect(validateClientTime(null, now)).toMatchObject({ ok: false, reason: "invalid" });
    expect(validateClientTime(undefined, now).ok).toBe(false);
  });
  it("accepts ISO strings and epoch numbers", () => {
    expect(validateClientTime("2026-01-05T19:59:00Z", now).ok).toBe(true);
    expect(validateClientTime(now.getTime() - 5000, now).ok).toBe(true);
  });
});
