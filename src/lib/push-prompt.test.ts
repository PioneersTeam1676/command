import { describe, expect, it } from "vitest";
import { SNOOZE_MS, shouldShowPushPrompt, snoozeAfterAsk } from "./push-prompt";

const base = { standalone: true, supported: true, ios: false, permission: "default" as const, snoozedUntil: null as number | null, now: 1_000 };

describe("shouldShowPushPrompt", () => {
  it("shows in the installed app when permission is undecided", () => {
    expect(shouldShowPushPrompt(base)).toBe(true);
  });
  it("never shows in a plain browser tab", () => {
    expect(shouldShowPushPrompt({ ...base, standalone: false })).toBe(false);
  });
  it("never shows when push is unsupported or already decided", () => {
    expect(shouldShowPushPrompt({ ...base, supported: false })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, permission: "denied" })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, permission: "granted" })).toBe(false);
  });
  it("stays hidden while snoozed and returns after the snooze", () => {
    expect(shouldShowPushPrompt({ ...base, snoozedUntil: 1_000 + SNOOZE_MS })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, snoozedUntil: 999 })).toBe(true);
  });
  it("treats a nonsense snooze value as not snoozed", () => {
    expect(shouldShowPushPrompt({ ...base, snoozedUntil: Number.NaN })).toBe(true);
  });
});

describe("snoozeAfterAsk", () => {
  it("snoozes when the person dismissed the browser prompt without choosing", () => {
    expect(snoozeAfterAsk("default")).toBe(true);
  });
  it("does not need a snooze once they chose", () => {
    expect(snoozeAfterAsk("granted")).toBe(false);
    expect(snoozeAfterAsk("denied")).toBe(false);
  });
});
