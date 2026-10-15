import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("proxy CSP", () => {
  it("allows Google profile photos and nothing broader", () => {
    const res = proxy(new NextRequest("http://localhost/"));
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("img-src 'self' data: blob: https://lh3.googleusercontent.com;");
  });
});
