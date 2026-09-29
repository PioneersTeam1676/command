import { describe, expect, it } from "vitest";
import { evaluate, nextHeartbeatAfter, type RegistrySnapshot } from "./state";

const H = 3_600_000;
const D = 24 * H;
const T0 = new Date("2026-03-01T12:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

const base = (over: Partial<RegistrySnapshot> = {}): RegistrySnapshot => ({
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

describe("unreachable timer", () => {
  it("is ok right after a heartbeat", () => expect(evaluate(base(), at(H))).toMatchObject({ state: "ok", readOnly: false }));

  it("warns after 24 hours of failures, with the time left", () => {
    const e = evaluate(base({ consecutiveFailures: 2 }), at(25 * H));
    expect(e).toMatchObject({ state: "warning", readOnly: false, reason: "no_heartbeat" });
    expect(e.msUntilStop).toBe(7 * D - 25 * H);
  });

  it("does NOT warn or stop on a clock that jumped forward if no attempt has failed", () => {
    // Nothing has actually failed; the next heartbeat would just succeed.
    expect(evaluate(base({ consecutiveFailures: 0 }), at(30 * D)).state).toBe("ok");
  });

  it("stays a warning until 7 days, however many attempts failed (a registry outage never stops anyone early)", () => {
    expect(evaluate(base({ consecutiveFailures: 500 }), at(7 * D - 1000)).state).toBe("warning");
  });

  it("becomes read-only at 7 days of failures, and export-related state is just readOnly=true", () => {
    const e = evaluate(base({ consecutiveFailures: 168 }), at(7 * D));
    expect(e).toMatchObject({ state: "stopped_unreachable", readOnly: true, msUntilStop: 0 });
  });

  it("needs several failed attempts, not just one, to stop", () => {
    expect(evaluate(base({ consecutiveFailures: 1 }), at(8 * D)).state).toBe("warning");
    expect(evaluate(base({ consecutiveFailures: 3 }), at(8 * D)).state).toBe("stopped_unreachable");
  });

  it("a later verified ok restores normal operation", () => {
    const stopped = base({ consecutiveFailures: 200 });
    expect(evaluate(stopped, at(9 * D)).readOnly).toBe(true);
    const recovered = base({ lastSuccessAt: at(9 * D), consecutiveFailures: 0 });
    expect(evaluate(recovered, at(9 * D + H))).toMatchObject({ state: "ok", readOnly: false });
  });

  it("before the first success, counts from setup", () => {
    const fresh = base({ lastSuccessAt: null, verifiedStatus: null, consecutiveFailures: 200 });
    expect(evaluate(fresh, at(2 * D)).state).toBe("warning");
    expect(evaluate(fresh, at(8 * D)).state).toBe("stopped_unreachable");
  });
});

describe("tampering only ever comes from verified evidence", () => {
  it("network failures alone never produce an integrity stop, however long they last", () => {
    for (const days of [1, 7, 30, 365]) {
      const e = evaluate(base({ consecutiveFailures: 10_000 }), at(days * D));
      expect(e.state).not.toBe("stopped_integrity");
    }
  });

  it("a verified integrity_failed response stops the instance; a later verified ok clears it", () => {
    expect(evaluate(base({ verifiedStatus: "integrity_failed" }), at(H))).toMatchObject({ state: "stopped_integrity", readOnly: true, reason: "verified_integrity_failed" });
    expect(evaluate(base({ verifiedStatus: "ok" }), at(2 * H)).state).toBe("ok");
  });

  it("a local file mismatch needs two sightings at least an hour apart", () => {
    const once = base({ firstMismatchAt: at(0), lastMismatchAt: at(0) });
    expect(evaluate(once, at(5 * H)).state).toBe("ok"); // a single startup is only a strike
    const soon = base({ firstMismatchAt: at(0), lastMismatchAt: at(30 * 60_000) });
    expect(evaluate(soon, at(H)).state).toBe("ok"); // second startup only 30 minutes later
    const confirmed = base({ firstMismatchAt: at(0), lastMismatchAt: at(H) });
    expect(evaluate(confirmed, at(H))).toMatchObject({ state: "stopped_integrity", reason: "local_mismatch", readOnly: true });
  });

  it("a missing manifest is not tampering", () => {
    const e = evaluate(base({ manifestMissing: true }), at(H));
    expect(e).toMatchObject({ state: "ok", readOnly: false, manifestMissing: true });
  });

  it("signed-response failures need 3+ failures spanning 24+ hours", () => {
    const few = base({ signatureFailures: 2, firstSignatureFailureAt: at(0), lastSignatureFailureAt: at(48 * H) });
    expect(evaluate(few, at(49 * H)).state).not.toBe("stopped_integrity");
    const quick = base({ signatureFailures: 50, firstSignatureFailureAt: at(0), lastSignatureFailureAt: at(2 * H) });
    expect(evaluate(quick, at(3 * H)).state).not.toBe("stopped_integrity");
    const forged = base({ signatureFailures: 3, firstSignatureFailureAt: at(0), lastSignatureFailureAt: at(24 * H) });
    expect(evaluate(forged, at(24 * H))).toMatchObject({ state: "stopped_integrity", reason: "signature_failures", readOnly: true });
  });
});

describe("owner revoke", () => {
  const revoked = (deadline: Date) => base({ verifiedStatus: "revoked", message: "Please contact us", revokeDeadline: deadline });
  it("shows a countdown before the deadline without stopping anything", () => {
    const e = evaluate(revoked(at(7 * D)), at(D));
    expect(e).toMatchObject({ state: "revoked", readOnly: false, message: "Please contact us" });
    expect(e.msUntilStop).toBe(6 * D);
  });
  it("becomes read-only exactly at the deadline", () => {
    expect(evaluate(revoked(at(7 * D)), at(7 * D - 1))).toMatchObject({ readOnly: false });
    expect(evaluate(revoked(at(7 * D)), at(7 * D))).toMatchObject({ state: "revoked", readOnly: true });
  });
  it("restore takes effect at the next verified heartbeat", () => {
    expect(evaluate(base({ verifiedStatus: "ok", message: null, revokeDeadline: null }), at(8 * D)).readOnly).toBe(false);
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
