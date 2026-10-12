import { describe, expect, it } from "vitest";
import { evaluate, nextHeartbeatAfter, type RegistrySnapshot } from "./state";

const H = 3_600_000;
const D = 24 * H;
const T0 = new Date("2026-03-01T12:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

const base = (over: Partial<RegistrySnapshot> = {}): RegistrySnapshot => ({
  enabled: true,
  referenceAt: T0,
  lastSuccessAt: T0,
  consecutiveFailures: 0,
  verifiedStatus: "ok",
  message: null,
  revokeDeadline: null,
  firstMismatchAt: null,
  lastMismatchAt: null,
  signatureFailures: 0,
  firstSignatureFailureAt: null,
  lastSignatureFailureAt: null,
  manifestMissing: false,
  ...over,
});

describe("never read-only", () => {
  it("has no read-only flag in any state", () => {
    const states = [
      evaluate(base(), at(H)),
      evaluate(base({ consecutiveFailures: 10_000 }), at(365 * D)),
      evaluate(base({ verifiedStatus: "integrity_failed" }), at(H)),
      evaluate(base({ verifiedStatus: "revoked", revokeDeadline: at(D) }), at(30 * D)),
    ];
    for (const e of states) expect(e).not.toHaveProperty("readOnly");
  });

  it("is 'disabled' when the check-in is turned off, whatever else is going on", () => {
    expect(evaluate(base({ enabled: false, verifiedStatus: "integrity_failed", consecutiveFailures: 99, message: "hi" }), at(30 * D))).toMatchObject({ state: "disabled", reason: "disabled", message: null });
  });
});

describe("unreachable", () => {
  it("is ok right after a heartbeat", () => expect(evaluate(base(), at(H))).toMatchObject({ state: "ok" }));

  it("warns after 24 hours of failures", () => {
    expect(evaluate(base({ consecutiveFailures: 2 }), at(25 * H))).toMatchObject({ state: "warning", reason: "no_heartbeat" });
  });

  it("does NOT warn on a clock that jumped forward if no attempt has failed", () => {
    expect(evaluate(base({ consecutiveFailures: 0 }), at(30 * D)).state).toBe("ok");
  });

  it("stays a warning however long it lasts", () => {
    expect(evaluate(base({ consecutiveFailures: 500 }), at(365 * D)).state).toBe("warning");
  });

  it("a later verified ok clears the warning", () => {
    expect(evaluate(base({ lastSuccessAt: at(9 * D), consecutiveFailures: 0 }), at(9 * D + H)).state).toBe("ok");
  });

  it("before the first success, counts from setup", () => {
    const fresh = base({ lastSuccessAt: null, verifiedStatus: null, consecutiveFailures: 200 });
    expect(evaluate(fresh, at(H)).state).toBe("ok");
    expect(evaluate(fresh, at(2 * D)).state).toBe("warning");
  });
});

describe("tampering only ever comes from verified evidence", () => {
  it("network failures alone never produce an integrity notice, however long they last", () => {
    for (const days of [1, 7, 30, 365]) expect(evaluate(base({ consecutiveFailures: 10_000 }), at(days * D)).state).not.toBe("integrity");
  });

  it("a verified integrity_failed response is reported; a later verified ok clears it", () => {
    expect(evaluate(base({ verifiedStatus: "integrity_failed" }), at(H))).toMatchObject({ state: "integrity", reason: "verified_integrity_failed" });
    expect(evaluate(base({ verifiedStatus: "ok" }), at(2 * H)).state).toBe("ok");
  });

  it("a local file mismatch needs two sightings at least an hour apart", () => {
    expect(evaluate(base({ firstMismatchAt: at(0), lastMismatchAt: at(0) }), at(5 * H)).state).toBe("ok");
    expect(evaluate(base({ firstMismatchAt: at(0), lastMismatchAt: at(30 * 60_000) }), at(H)).state).toBe("ok");
    expect(evaluate(base({ firstMismatchAt: at(0), lastMismatchAt: at(H) }), at(H))).toMatchObject({ state: "integrity", reason: "local_mismatch" });
  });

  it("a missing manifest is not tampering", () => {
    expect(evaluate(base({ manifestMissing: true }), at(H))).toMatchObject({ state: "ok", manifestMissing: true });
  });

  it("signed-response failures need 3+ failures spanning 24+ hours", () => {
    expect(evaluate(base({ signatureFailures: 2, firstSignatureFailureAt: at(0), lastSignatureFailureAt: at(48 * H) }), at(49 * H)).state).not.toBe("integrity");
    expect(evaluate(base({ signatureFailures: 50, firstSignatureFailureAt: at(0), lastSignatureFailureAt: at(2 * H) }), at(3 * H)).state).not.toBe("integrity");
    expect(evaluate(base({ signatureFailures: 3, firstSignatureFailureAt: at(0), lastSignatureFailureAt: at(24 * H) }), at(24 * H))).toMatchObject({ state: "integrity", reason: "signature_failures" });
  });
});

describe("owner revoke", () => {
  it("shows the owner's message, before and after any deadline", () => {
    const revoked = base({ verifiedStatus: "revoked", message: "Please contact us", revokeDeadline: at(7 * D) });
    expect(evaluate(revoked, at(D))).toMatchObject({ state: "revoked", message: "Please contact us" });
    expect(evaluate(revoked, at(8 * D))).toMatchObject({ state: "revoked", message: "Please contact us" });
  });
  it("restore takes effect at the next verified heartbeat", () => {
    expect(evaluate(base({ verifiedStatus: "ok", message: null, revokeDeadline: null }), at(8 * D)).state).toBe("ok");
  });
});

describe("nextHeartbeatAfter", () => {
  it("is about a day away with jitter after success", () => {
    const lo = nextHeartbeatAfter(T0, true, () => 0).getTime() - T0.getTime();
    const hi = nextHeartbeatAfter(T0, true, () => 1).getTime() - T0.getTime();
    expect(lo).toBe(23 * H);
    expect(hi).toBe(25 * H);
  });
  it("retries within the hour after a failure", () => expect(nextHeartbeatAfter(T0, false).getTime() - T0.getTime()).toBe(H));
});
