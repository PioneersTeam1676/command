import { describe, expect, it } from "vitest";
import { safeAvatarUrl } from "./avatar-url";

describe("safeAvatarUrl", () => {
  it("accepts https Google photo URLs", () => {
    expect(safeAvatarUrl("https://lh3.googleusercontent.com/a/abc=s96-c")).toBe("https://lh3.googleusercontent.com/a/abc=s96-c");
  });
  it("rejects other hosts, schemes and junk", () => {
    expect(safeAvatarUrl("http://lh3.googleusercontent.com/a/abc")).toBeNull();
    expect(safeAvatarUrl("https://evil.example.com/a.png")).toBeNull();
    expect(safeAvatarUrl("https://lh3.googleusercontent.com.evil.com/a")).toBeNull();
    expect(safeAvatarUrl("javascript:alert(1)")).toBeNull();
    expect(safeAvatarUrl("not a url")).toBeNull();
    expect(safeAvatarUrl(undefined)).toBeNull();
    expect(safeAvatarUrl(42)).toBeNull();
  });
  it("rejects absurdly long URLs", () => {
    expect(safeAvatarUrl("https://lh3.googleusercontent.com/" + "a".repeat(3000))).toBeNull();
  });
});
