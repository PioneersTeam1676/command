import { beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "./env";
import { decryptSecret, encryptSecret, secretsConfigured } from "./secrets";

const KEY = "k".repeat(40);

describe("secrets", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://x";
    process.env.SHARED_LOGIN_KEY = KEY;
    resetEnvCache();
  });

  it("round-trips and never stores the plain text", () => {
    const enc = encryptSecret("hunter2 pässword");
    expect(enc).not.toContain("hunter2");
    expect(decryptSecret(enc)).toBe("hunter2 pässword");
  });
  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });
  it("refuses tampered values", () => {
    const parts = encryptSecret("x").split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
  it("cannot be read with a different key", () => {
    const enc = encryptSecret("x");
    process.env.SHARED_LOGIN_KEY = "z".repeat(40);
    resetEnvCache();
    expect(() => decryptSecret(enc)).toThrow();
  });
  it("reports whether it is configured", () => {
    expect(secretsConfigured()).toBe(true);
    delete process.env.SHARED_LOGIN_KEY;
    resetEnvCache();
    expect(secretsConfigured()).toBe(false);
    expect(() => encryptSecret("x")).toThrow();
  });
});
