/**
 * Registry and license-check settings. This whole folder (src/lib/registry/) is the license
 * compliance mechanism described in LICENSE section 3, the setup wizard and the README. It is
 * deliberately in one place and clearly named.
 */

/** PLACEHOLDER: the owner must replace this with the public HTTPS address of their registry before release. */
export const REGISTRY_URL = "https://cmd-admin.team1676.org";

/**
 * Ed25519 public keys (raw 32 bytes, base64) the registry signs responses with: the current key, and
 * optionally the next one, so the owner can rotate without breaking deployed instances
 * (see registry/README.md). PLACEHOLDER: replace with the output of the registry's `generate-keypair`.
 */
export const REGISTRY_PUBLIC_KEYS: readonly string[] = ["QhF899ZwAV13HaGvxg8OXbLV4GtJ24pmVc3XAwOC+/k="];

/** Shown to users and sent to the registry. Bump on every release (and add its integrity hash to the registry). */
export const COMMAND_VERSION = "0.1.0";

/** The address can be overridden by env only in development, so a production install can't be quietly redirected. */
export function registryUrl(env: { NODE_ENV?: string; REGISTRY_URL_OVERRIDE?: string } = process.env): string {
  if (env.NODE_ENV === "development" && env.REGISTRY_URL_OVERRIDE) return env.REGISTRY_URL_OVERRIDE.replace(/\/$/, "");
  return REGISTRY_URL;
}

/**
 * Same rule for the trusted keys: only a development run may substitute its own (comma-separated), so a
 * production install can't be pointed at a look-alike registry through the environment.
 */
export function registryKeys(env: { NODE_ENV?: string; REGISTRY_PUBLIC_KEYS_OVERRIDE?: string } = process.env): readonly string[] {
  if (env.NODE_ENV === "development" && env.REGISTRY_PUBLIC_KEYS_OVERRIDE) return env.REGISTRY_PUBLIC_KEYS_OVERRIDE.split(",").map((k) => k.trim()).filter(Boolean);
  return REGISTRY_PUBLIC_KEYS;
}

const HOUR = 3_600_000;
export const TIMING = {
  /** Normal cadence, with +/- jitter so a whole fleet doesn't call at the same second. */
  heartbeatIntervalMs: 24 * HOUR,
  jitterMs: HOUR,
  /** After a failed attempt, try again after this long. */
  retryMs: HOUR,
  /** No successful heartbeat for this long: admins are warned. */
  warnAfterMs: 24 * HOUR,
  /** No successful heartbeat for this long: the instance becomes read-only. */
  stopAfterMs: 7 * 24 * HOUR,
  /** Urgent warning when this much time is left before it becomes read-only. */
  urgentLeftMs: 48 * HOUR,
  /** A local file mismatch must be seen again at least this long after the first sighting to count. */
  mismatchConfirmAfterMs: HOUR,
  /** Signed-response failures must span at least this long (and number 3+) to count as tampering. */
  signatureFailureSpanMs: 24 * HOUR,
  signatureFailureCount: 3,
  /** Failed attempts required before an instance is told it is unreachable/read-only. */
  failuresForWarning: 1,
  failuresForStop: 3,
  requestTimeoutMs: 15_000,
} as const;

export const OWNER_CONTACT = "alex@alexradu.co";
