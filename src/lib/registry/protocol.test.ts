import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, verifyEnvelope } from "./protocol";

const pair = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { privateKey, rawPublic: publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("base64") };
};
const envelope = (privateKey: ReturnType<typeof pair>["privateKey"], body: Record<string, unknown>) => ({
  body,
  signature: sign(null, Buffer.from(canonicalJson(body)), privateKey).toString("base64"),
});
const NONCE = "abcdef0123456789";
const good = { status: "ok", nonce: NONCE, serverTime: "2026-03-01T12:00:00.000Z" };

describe("canonicalJson", () => {
  it("sorts keys, drops undefined, keeps arrays in order", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: undefined } })).toBe('{"a":{"d":[3,1]},"b":1}');
  });
  it("is the same regardless of key order", () => expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 })));
  // This exact vector is also checked in the registry app's tests so the two sides can never drift apart.
  it("matches the shared test vector", () => {
    expect(canonicalJson({ status: "ok", nonce: "n", serverTime: "t", message: null, nested: { z: 1, a: [true, "x"] } })).toBe(
      '{"message":null,"nested":{"a":[true,"x"],"z":1},"nonce":"n","serverTime":"t","status":"ok"}',
    );
  });
});

describe("verifyEnvelope", () => {
  const { privateKey, rawPublic } = pair();

  it("accepts a correctly signed response with our nonce", () => {
    const r = verifyEnvelope(envelope(privateKey, good), NONCE, [rawPublic]);
    expect(r).toMatchObject({ ok: true, body: { status: "ok" } });
  });

  it("rejects a forged response (signed with a different key)", () => {
    const attacker = pair();
    expect(verifyEnvelope(envelope(attacker.privateKey, good), NONCE, [rawPublic])).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered body even if the signature was once valid", () => {
    const env = envelope(privateKey, { ...good, status: "revoked" });
    (env.body as Record<string, unknown>).status = "ok";
    expect(verifyEnvelope(env, NONCE, [rawPublic])).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a replayed response (valid signature, but for an earlier request's nonce)", () => {
    const recorded = envelope(privateKey, good);
    expect(verifyEnvelope(recorded, "some-other-nonce-1234", [rawPublic])).toEqual({ ok: false, reason: "nonce_mismatch" });
  });

  it("accepts either the current or the next key during a key rotation", () => {
    const next = pair();
    expect(verifyEnvelope(envelope(next.privateKey, good), NONCE, [rawPublic, next.rawPublic]).ok).toBe(true);
    expect(verifyEnvelope(envelope(privateKey, good), NONCE, [next.rawPublic, rawPublic]).ok).toBe(true);
  });

  it("treats non-registry responses (HTML, junk) as malformed, not as a signature failure", () => {
    for (const junk of ["<html>", null, 42, {}, { body: {}, signature: "short" }, { ok: true }]) {
      expect(verifyEnvelope(junk, NONCE, [rawPublic])).toEqual({ ok: false, reason: "malformed" });
    }
  });

  it("rejects a signed body that isn't a valid registry body", () => {
    expect(verifyEnvelope(envelope(privateKey, { status: "nonsense", nonce: NONCE, serverTime: "x" }), NONCE, [rawPublic])).toEqual({ ok: false, reason: "invalid_body" });
  });

  it("never throws on a malformed public key", () => {
    expect(verifyEnvelope(envelope(privateKey, good), NONCE, ["not-a-key"])).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("carries revoked details and a token on register", () => {
    const r = verifyEnvelope(envelope(privateKey, { status: "revoked", message: "Call us", deadline: "2026-03-08T00:00:00.000Z", nonce: NONCE, serverTime: "2026-03-01T00:00:00.000Z", instanceToken: "t".repeat(32) }), NONCE, [rawPublic]);
    expect(r).toMatchObject({ ok: true, body: { status: "revoked", message: "Call us", deadline: "2026-03-08T00:00:00.000Z" } });
  });
});
