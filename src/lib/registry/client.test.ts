import { generateKeyPairSync, sign } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasTestDb } from "@/test/db";
import { canonicalJson } from "./protocol";

const H = 3_600_000;
const D = 24 * H;
const T0 = new Date("2026-03-01T12:00:00Z");

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUB = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("base64");
const attacker = generateKeyPairSync("ed25519").privateKey;

type Body = Record<string, unknown>;
const signed = (body: Body, key = privateKey) => ({ body, signature: sign(null, Buffer.from(canonicalJson(body)), key).toString("base64") });
const json = (status: number, value: unknown) => new Response(typeof value === "string" ? value : JSON.stringify(value), { status });

describe.skipIf(!hasTestDb)("registry client against a fake registry", () => {
  let drop: () => Promise<void>;
  let adminId: string;
  let clock = T0.getTime();
  let nonceN = 0;
  const seen: { path: string; auth: string | null; payload: Record<string, unknown> }[] = [];
  type Mode = "ok" | "down" | "html" | "http500" | "forged" | "replay" | "revoked" | "unknown_token" | "integrity_failed" | "warn";
  let mode: Mode = "ok";
  let lastGood: unknown = null;
  let revokeDeadline = "";

  const respond = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const payload = JSON.parse(String(init?.body));
    const auth = new Headers(init?.headers).get("authorization");
    seen.push({ path: url.pathname, auth, payload });
    const base = { nonce: payload.nonce, serverTime: new Date(clock).toISOString() };
    if (mode === "down") throw new TypeError("fetch failed");
    if (mode === "html") return json(200, "<html>captive portal</html>");
    if (mode === "http500") return json(503, { error: "maintenance" });
    if (mode === "unknown_token" && url.pathname === "/v1/heartbeat") return json(401, { error: "unknown token" });
    if (mode === "forged") return json(200, signed({ status: "ok", ...base }, attacker));
    if (mode === "replay") return json(200, lastGood);
    const body: Body =
      mode === "revoked" ? { status: "revoked", message: "Please contact the owner", deadline: revokeDeadline, ...base }
      : mode === "integrity_failed" ? { status: "integrity_failed", message: "Modified build", ...base }
      : mode === "warn" ? { status: "warn", message: "Please update soon", ...base }
      : { status: "ok", ...base };
    if (url.pathname === "/v1/register") body.instanceToken = "tok_" + "x".repeat(40);
    const env = signed(body);
    if (mode === "ok") lastGood = env;
    return json(200, env);
  };

  const deps = () => ({
    fetch: respond as typeof fetch,
    now: () => new Date(clock),
    nonce: () => `nonce-${String(++nonceN).padStart(8, "0")}`,
    keys: [PUB],
    baseUrl: "https://registry.test",
    random: () => 0.5,
    integrity: () => ({ status: "ok" as const, actualHash: "a".repeat(64) }),
  });

  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    drop = (await createTestDb()).drop;
    const { db } = await import("@/db");
    const { users, teamSettings } = await import("@/db/schema");
    await db.insert(teamSettings).values({ id: 1, name: "Test Robotics", teamNumber: "1234", region: "NE", installId: "11111111-1111-4111-8111-111111111111", setupCompletedAt: T0, timezone: "UTC" });
    adminId = (await db.insert(users).values({ email: "admin@x.com", name: "Admin", role: "admin", status: "active" }).returning({ id: users.id }))[0]!.id;
    await db.insert(users).values([
      { email: "m1@x.com", name: "M1 secret name", role: "member", status: "active" },
      { email: "m2@x.com", name: "M2", role: "lead", status: "active" },
      { email: "p@x.com", name: "Parent", role: "parent", status: "active" },
    ]);
  });
  afterAll(async () => {
    await drop?.();
  });

  const tick = (ms: number) => void (clock += ms);
  const run = async () => (await import("./client")).sendHeartbeat(deps());

  it("registers at first, sending exactly the disclosed fields and no personal data", async () => {
    const r = await run();
    expect(r.outcome).toBe("success");
    const reg = seen.find((s) => s.path === "/v1/register")!;
    expect(reg.auth).toBeNull();
    expect(Object.keys(reg.payload).sort()).toEqual(["installId", "integrityHash", "memberCount", "nonce", "region", "teamName", "teamNumber", "timestamp", "version"]);
    expect(reg.payload).toMatchObject({ installId: "11111111-1111-4111-8111-111111111111", teamName: "Test Robotics", teamNumber: "1234", region: "NE", memberCount: 3, integrityHash: "a".repeat(64) });
    const wire = JSON.stringify(seen);
    for (const secret of ["admin@x.com", "M1 secret name", "m1@x.com", "Parent"]) expect(wire).not.toContain(secret); // never names or emails
    const { readRegistryRow } = await import("./store");
    const row = await readRegistryRow();
    expect(row).toMatchObject({ status: "ok", consecutiveFailures: 0 });
    expect(row.instanceToken).toMatch(/^tok_/);
    expect(row.registeredAt).not.toBeNull();
  });

  it("uses the token for later heartbeats, and the state stays ok", async () => {
    tick(D);
    const r = await run();
    expect(r.outcome).toBe("success");
    expect(r.effective).toMatchObject({ state: "ok" });
    const hb = seen.filter((s) => s.path === "/v1/heartbeat").at(-1)!;
    expect(hb.auth).toBe("Bearer tok_" + "x".repeat(40));
  });

  it("network errors, timeouts, 5xx and HTML pages count only toward the unreachable timer, never as tampering", async () => {
    const { readRegistryRow } = await import("./store");
    for (const m of ["down", "html", "http500"] as const) {
      mode = m;
      tick(H);
      const r = await run();
      expect(r.outcome).toBe("network_failure");
      expect(r.effective.state).not.toBe("integrity");
    }
    const row = await readRegistryRow();
    expect(row.signatureFailures).toBe(0);
    expect(row.consecutiveFailures).toBe(3);
  });

  it("warns admins once after a day of failures, and never goes read-only however long it lasts", async () => {
    const { db } = await import("@/db");
    const { inAppNotifications } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    mode = "down";
    const notes = async () => (await db.select().from(inAppNotifications).where(eq(inAppNotifications.userId, adminId))).filter((n) => n.type === "registry_warning");

    tick(22 * H); // ~25 hours since the last success
    let r = await run();
    expect(r.effective.state).toBe("warning");
    const first = (await notes()).length;
    expect(first).toBe(1);
    for (let i = 0; i < 24 * 10; i++) {
      tick(H);
      r = await run();
    }
    expect(r.effective.state).toBe("warning");
    expect(r.effective).not.toHaveProperty("readOnly");
    expect((await notes()).length).toBe(first); // no daily nagging
  });

  it("a successful heartbeat restores normal operation automatically", async () => {
    mode = "ok";
    tick(H);
    const r = await run();
    expect(r.outcome).toBe("success");
    expect(r.effective).toMatchObject({ state: "ok" });
  });

  it("forged responses and replayed responses are rejected and counted as signature failures", async () => {
    const { readRegistryRow } = await import("./store");
    mode = "forged";
    tick(H);
    let r = await run();
    expect(r.outcome).toBe("signature_failure");
    mode = "replay"; // a perfectly signed response, but for an older request
    tick(H);
    r = await run();
    expect(r.outcome).toBe("signature_failure");
    const row = await readRegistryRow();
    expect(row.signatureFailures).toBe(2);
    expect(row.status).toBe("ok"); // nothing from the forged/replayed answers was believed
    expect(r.effective.state).not.toBe("integrity"); // needs 3+ over 24h
  });

  it("3+ signature failures spanning 24h are reported as an integrity problem; a verified ok clears it", async () => {
    mode = "forged";
    for (let i = 0; i < 26; i++) {
      tick(H);
      await run();
    }
    let r = await run();
    expect(r.effective).toMatchObject({ state: "integrity", reason: "signature_failures" });
    mode = "ok";
    tick(H);
    r = await run();
    expect(r.effective).toMatchObject({ state: "ok" });
  });

  it("a verified integrity_failed response is reported and a later verified ok clears it", async () => {
    mode = "integrity_failed";
    tick(H);
    let r = await run();
    expect(r.effective).toMatchObject({ state: "integrity", reason: "verified_integrity_failed" });
    mode = "ok";
    tick(H);
    r = await run();
    expect(r.effective.state).toBe("ok");
  });

  it("revoke: shows the owner's message, never limits the app; restore round-trips", async () => {
    revokeDeadline = new Date(clock + 7 * D).toISOString();
    mode = "revoked";
    tick(H);
    let r = await run();
    expect(r.effective).toMatchObject({ state: "revoked", message: "Please contact the owner" });
    tick(8 * D);
    r = await run();
    expect(r.effective).toMatchObject({ state: "revoked" });
    expect(r.effective).not.toHaveProperty("readOnly");
    mode = "ok"; // the owner restores it; takes effect at the next heartbeat
    tick(H);
    r = await run();
    expect(r.effective).toMatchObject({ state: "ok", message: null });
  });

  it("a warn response shows the owner's message to admins without changing behaviour", async () => {
    mode = "warn";
    tick(H);
    const r = await run();
    expect(r.effective).toMatchObject({ state: "ok", message: "Please update soon" });
    mode = "ok";
    tick(H);
    await run();
  });

  it("re-registers when the registry no longer knows our token (rotated)", async () => {
    const { readRegistryRow } = await import("./store");
    const before = (await readRegistryRow()).instanceToken;
    mode = "unknown_token";
    tick(H);
    const r = await run();
    expect(r.outcome).toBe("success");
    expect(seen.at(-1)!.path).toBe("/v1/register");
    expect((await readRegistryRow()).instanceToken).toBe(before); // fake issues the same token; the point is that it re-registered
    mode = "ok";
  });

  it("startup integrity: a missing manifest is not tampering; a mismatch confirmed at two startups an hour apart is", async () => {
    const { startupIntegrityCheck } = await import("./client");
    const { readRegistryRow } = await import("./store");
    const d = deps();
    // Missing manifest: recorded, no strike.
    await startupIntegrityCheck({ ...d, integrity: () => ({ status: "manifest_missing", actualHash: "b".repeat(64) }) });
    let row = await readRegistryRow();
    expect(row).toMatchObject({ manifestMissing: true, firstMismatchAt: null });

    const bad = { ...d, integrity: () => ({ status: "mismatch" as const, actualHash: "c".repeat(64), changed: ["client.ts"] }) };
    tick(H);
    await startupIntegrityCheck(bad);
    tick(20 * 60_000);
    await startupIntegrityCheck(bad); // 20 minutes later: still not confirmed
    const { evaluate } = await import("./state");
    const { snapshot } = await import("./store");
    expect(evaluate(await snapshot(), new Date(clock)).state).toBe("ok");
    tick(H);
    await startupIntegrityCheck(bad); // an hour after the first sighting
    row = await readRegistryRow();
    expect(evaluate(await snapshot(), new Date(clock))).toMatchObject({ state: "integrity", reason: "local_mismatch" });
    // Files restored: back to normal.
    await startupIntegrityCheck({ ...d, integrity: () => ({ status: "ok", actualHash: "a".repeat(64) }) });
    expect(evaluate(await snapshot(), new Date(clock)).state).toBe("ok");
  });

  it("turned off in Settings: no check-ins are sent and the state is 'disabled'", async () => {
    const { db } = await import("@/db");
    const { teamSettings } = await import("@/db/schema");
    const { runHeartbeatIfDue } = await import("./client");
    const { getEffectiveState, invalidateStateCache } = await import("./index");
    await db.update(teamSettings).set({ registryEnabled: false });
    const sent = seen.length;
    expect(await runHeartbeatIfDue(deps(), true)).toBe(false);
    expect(seen.length).toBe(sent);
    invalidateStateCache();
    expect((await getEffectiveState()).state).toBe("disabled");
    await db.update(teamSettings).set({ registryEnabled: true });
    invalidateStateCache();
    expect((await getEffectiveState()).state).not.toBe("disabled");
  });
});
