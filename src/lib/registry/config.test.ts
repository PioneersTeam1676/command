import { describe, expect, it } from "vitest";
import { REGISTRY_PUBLIC_KEYS, REGISTRY_URL, registryKeys, registryUrl } from "./config";

describe("registry address and keys can only be overridden in development", () => {
  it("production ignores overrides", () => {
    expect(registryUrl({ NODE_ENV: "production", REGISTRY_URL_OVERRIDE: "https://evil.example" })).toBe(REGISTRY_URL);
    expect(registryKeys({ NODE_ENV: "production", REGISTRY_PUBLIC_KEYS_OVERRIDE: "AAAA" })).toEqual(REGISTRY_PUBLIC_KEYS);
    expect(registryUrl({ NODE_ENV: "test", REGISTRY_URL_OVERRIDE: "https://evil.example" })).toBe(REGISTRY_URL);
  });
  it("development may substitute both", () => {
    expect(registryUrl({ NODE_ENV: "development", REGISTRY_URL_OVERRIDE: "http://localhost:3300/" })).toBe("http://localhost:3300");
    expect(registryKeys({ NODE_ENV: "development", REGISTRY_PUBLIC_KEYS_OVERRIDE: "k1, k2" })).toEqual(["k1", "k2"]);
  });
  it("ships with a placeholder address the owner must replace", () => expect(REGISTRY_URL).toContain("example.invalid"));
});
