import { TIMING } from "./config";

/**
 * The instance state machine (spec 9.3). Pure: give it what we know and the current time, get back what
 * the instance should do. Everything that can stop an instance is decided here, in one place.
 *
 * What can stop an instance:
 *  - a *verified* registry response saying `integrity_failed`
 *  - the same local file mismatch confirmed at two startups at least an hour apart
 *  - 3+ signed-response failures spanning at least 24 hours (something is forging or altering responses)
 *  - no successful heartbeat for 7 days, after failed attempts (unreachable)
 *  - an owner revoke, once its deadline has passed
 * What can NOT: network errors, timeouts and 5xx responses never count as tampering.
 */

export type VerifiedStatus = "ok" | "warn" | "integrity_failed" | "revoked";

export type RegistrySnapshot = {
  /** When we started counting: setup completion, or registration. Used until the first success. */
  referenceAt: Date;
  lastSuccessAt: Date | null;
  /** Failed attempts since the last success. Failures only count once an attempt has actually been made. */
  consecutiveFailures: number;
  /** Status from the last verified response, if any. */
  verifiedStatus: VerifiedStatus | null;
  message: string | null;
  revokeDeadline: Date | null;
  /** First time we saw local files differ from the build manifest (null when they match). */
  firstMismatchAt: Date | null;
  lastMismatchAt: Date | null;
  signatureFailures: number;
  firstSignatureFailureAt: Date | null;
  lastSignatureFailureAt: Date | null;
  manifestMissing: boolean;
};

export type InstanceState = "ok" | "warning" | "stopped_unreachable" | "stopped_integrity" | "revoked";

export type Effective = {
  state: InstanceState;
  readOnly: boolean;
  /** Why, for admins: a short machine-friendly reason. */
  reason: "none" | "no_heartbeat" | "verified_integrity_failed" | "local_mismatch" | "signature_failures" | "revoked";
  /** Owner message (warn/revoked) to show admins. */
  message: string | null;
  /** Milliseconds since the last successful heartbeat (or since we started counting). */
  msSinceSuccess: number;
  /** Time left before the instance goes read-only, when it is counting down (unreachable or revoked). */
  msUntilStop: number | null;
  revokeDeadline: Date | null;
  manifestMissing: boolean;
};

export const localMismatchConfirmed = (s: RegistrySnapshot, now: Date) =>
  s.firstMismatchAt !== null && s.lastMismatchAt !== null && s.lastMismatchAt.getTime() - s.firstMismatchAt.getTime() >= TIMING.mismatchConfirmAfterMs && now.getTime() >= s.lastMismatchAt.getTime();

export const signatureFailuresTrigger = (s: RegistrySnapshot) =>
  s.signatureFailures >= TIMING.signatureFailureCount &&
  s.firstSignatureFailureAt !== null &&
  s.lastSignatureFailureAt !== null &&
  s.lastSignatureFailureAt.getTime() - s.firstSignatureFailureAt.getTime() >= TIMING.signatureFailureSpanMs;

export function evaluate(s: RegistrySnapshot, now: Date): Effective {
  const since = now.getTime() - (s.lastSuccessAt ?? s.referenceAt).getTime();
  const base = { message: s.message, msSinceSuccess: Math.max(0, since), msUntilStop: null as number | null, revokeDeadline: s.revokeDeadline, manifestMissing: s.manifestMissing };

  // 1. Tampering. Only verified evidence or repeated confirmation, never a plain network failure.
  if (s.verifiedStatus === "integrity_failed") return { ...base, state: "stopped_integrity", readOnly: true, reason: "verified_integrity_failed" };
  if (localMismatchConfirmed(s, now)) return { ...base, state: "stopped_integrity", readOnly: true, reason: "local_mismatch" };
  if (signatureFailuresTrigger(s)) return { ...base, state: "stopped_integrity", readOnly: true, reason: "signature_failures" };

  // 2. Revoked by the owner: a countdown, then read-only.
  const revoked = s.verifiedStatus === "revoked";
  if (revoked && s.revokeDeadline && now >= s.revokeDeadline) return { ...base, state: "revoked", readOnly: true, reason: "revoked" };

  // 3. Unreachable. Requires real failed attempts, so a wrong clock alone can't stop anyone.
  if (since >= TIMING.stopAfterMs && s.consecutiveFailures >= TIMING.failuresForStop) {
    return { ...base, state: "stopped_unreachable", readOnly: true, reason: "no_heartbeat", msUntilStop: 0 };
  }
  if (revoked) return { ...base, state: "revoked", readOnly: false, reason: "revoked", msUntilStop: s.revokeDeadline ? Math.max(0, s.revokeDeadline.getTime() - now.getTime()) : null };
  if (since >= TIMING.warnAfterMs && s.consecutiveFailures >= TIMING.failuresForWarning) {
    return { ...base, state: "warning", readOnly: false, reason: "no_heartbeat", msUntilStop: Math.max(0, TIMING.stopAfterMs - since) };
  }
  return { ...base, state: "ok", readOnly: false, reason: "none" };
}

/** Next heartbeat time: a day away with jitter after success, an hour away after a failure. */
export function nextHeartbeatAfter(now: Date, ok: boolean, random: () => number = Math.random): Date {
  if (!ok) return new Date(now.getTime() + TIMING.retryMs);
  const jitter = (random() * 2 - 1) * TIMING.jitterMs;
  return new Date(now.getTime() + TIMING.heartbeatIntervalMs + jitter);
}
