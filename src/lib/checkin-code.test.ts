import { describe, expect, it } from "vitest";
import { CODE_STEP_MS, codeForWindow, currentCode, newSecret, verifyCode } from "./checkin-code";

const secret = "test-secret-1";
const w = 29_000_000; // an arbitrary window index
const t = (index: number, offsetMs: number) => new Date(index * CODE_STEP_MS + offsetMs);

describe("rotating codes", () => {
  it("is 6 digits and stable within a window", () => {
    const a = currentCode(secret, t(w, 1000));
    const b = currentCode(secret, t(w, 59_000));
    expect(a.code).toMatch(/^\d{6}$/);
    expect(a.code).toBe(b.code);
  });
  it("changes every window and differs per secret", () => {
    expect(codeForWindow(secret, w)).not.toBe(codeForWindow(secret, w + 1));
    expect(codeForWindow(secret, w)).not.toBe(codeForWindow(newSecret(), w));
  });
  it("refreshAt is the next window boundary", () => {
    expect(currentCode(secret, t(w, 10_000)).refreshAt.getTime()).toBe((w + 1) * CODE_STEP_MS);
  });
  it("accepts the current code", () => {
    expect(verifyCode(secret, codeForWindow(secret, w), t(w, 45_000))).toBe(true);
  });
  it("accepts the previous code for 30 s after rotation, then rejects it", () => {
    const prev = codeForWindow(secret, w - 1);
    expect(verifyCode(secret, prev, t(w, 0))).toBe(true);
    expect(verifyCode(secret, prev, t(w, 29_999))).toBe(true);
    expect(verifyCode(secret, prev, t(w, 30_000))).toBe(false);
    expect(verifyCode(secret, prev, t(w, 59_000))).toBe(false);
  });
  it("rejects old codes and codes for the future", () => {
    expect(verifyCode(secret, codeForWindow(secret, w - 2), t(w, 1000))).toBe(false);
    expect(verifyCode(secret, codeForWindow(secret, w + 1), t(w, 59_000))).toBe(false);
  });
  it("rejects malformed input and another event's code", () => {
    expect(verifyCode(secret, "12345", t(w, 1000))).toBe(false);
    expect(verifyCode(secret, "abcdef", t(w, 1000))).toBe(false);
    expect(verifyCode(secret, codeForWindow("other-secret", w), t(w, 1000))).toBe(false);
  });
  it("tolerates spaces typed into the code", () => {
    const c = codeForWindow(secret, w);
    expect(verifyCode(secret, `${c.slice(0, 3)} ${c.slice(3)}`, t(w, 1000))).toBe(true);
  });
});
