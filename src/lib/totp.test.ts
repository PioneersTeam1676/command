import { describe, expect, it } from "vitest";
import { base32Decode, secondsLeft, totp } from "./totp";

// RFC 6238 appendix B, SHA-1, secret "12345678901234567890". Published codes are 8 digits; 6 digits are the last six.
const rfc = Buffer.from("12345678901234567890");

describe("totp", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("matches the RFC vector at t=%i", (t, eight) => {
    expect(totp(rfc, t * 1000, 8)).toBe(eight);
    expect(totp(rfc, t * 1000)).toBe(eight.slice(2));
  });
  it("keeps leading zeros", () => {
    expect(totp(rfc, 1111111109 * 1000)).toBe("081804");
  });
  it("counts down to the next 30 second boundary", () => {
    expect(secondsLeft(0)).toBe(30);
    expect(secondsLeft(29_999)).toBe(1);
    expect(secondsLeft(30_000)).toBe(30);
  });
});

describe("base32Decode", () => {
  it("decodes the RFC secret in its usual base32 form", () => {
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")?.toString()).toBe("12345678901234567890");
  });
  it("ignores spaces, dashes, case and padding", () => {
    expect(base32Decode("gezd gnbv-GY3T QOJQ GEZD GNBV GY3T QOJQ====")?.toString()).toBe("12345678901234567890");
  });
  it("rejects characters outside base32 and empty input", () => {
    expect(base32Decode("GEZD1")).toBeNull();
    expect(base32Decode("  ")).toBeNull();
  });
});
