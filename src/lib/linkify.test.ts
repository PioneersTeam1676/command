import { describe, expect, it } from "vitest";
import { linkify, shortUrl } from "./linkify";

describe("linkify", () => {
  it("returns plain text as one segment", () => {
    expect(linkify("Bring safety glasses.")).toEqual([{ type: "text", value: "Bring safety glasses." }]);
  });
  it("splits out http and https URLs", () => {
    expect(linkify("Map: https://example.com/pit?x=1 and http://a.org/b")).toEqual([
      { type: "text", value: "Map: " },
      { type: "url", value: "https://example.com/pit?x=1" },
      { type: "text", value: " and " },
      { type: "url", value: "http://a.org/b" },
    ]);
  });
  it("leaves trailing punctuation outside the link", () => {
    expect(linkify("See https://example.com/a.")).toEqual([
      { type: "text", value: "See " },
      { type: "url", value: "https://example.com/a" },
      { type: "text", value: "." },
    ]);
    expect(linkify("(https://example.com/a), ok")[1]).toEqual({ type: "url", value: "https://example.com/a" });
  });
  it("never links other schemes", () => {
    expect(linkify("javascript:alert(1) and data:text/html,hi and ftp://x.org")).toEqual([
      { type: "text", value: "javascript:alert(1) and data:text/html,hi and ftp://x.org" },
    ]);
  });
  it("keeps newlines and handles empty input", () => {
    expect(linkify("a\n\nb")).toEqual([{ type: "text", value: "a\n\nb" }]);
    expect(linkify("")).toEqual([]);
  });
});

describe("shortUrl", () => {
  it("shows host and path without the scheme, trimmed to length", () => {
    expect(shortUrl("https://www.example.com/a/b")).toBe("example.com/a/b");
    const long = shortUrl("https://example.com/" + "x".repeat(100));
    expect(long.length).toBeLessThanOrEqual(41);
    expect(long.endsWith("…")).toBe(true);
  });
});
