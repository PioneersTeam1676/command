import { describe, expect, it } from "vitest";
import { decideSignup, emailDomain, isAllowedDomain, normalizeDomain } from "./approval";

const allowed = ["school.edu", "Team.ORG"];

describe("isAllowedDomain", () => {
  it("matches exactly and case-insensitively", () => {
    expect(isAllowedDomain("kid@SCHOOL.edu", allowed)).toBe(true);
    expect(isAllowedDomain("kid@team.org", allowed)).toBe(true);
  });
  it("does not imply subdomains or suffix tricks", () => {
    expect(isAllowedDomain("kid@mail.school.edu", allowed)).toBe(false);
    expect(isAllowedDomain("kid@evilschool.edu", allowed)).toBe(false);
    expect(isAllowedDomain("kid@school.edu.evil.com", allowed)).toBe(false);
    expect(isAllowedDomain("school.edu@evil.com", allowed)).toBe(false);
  });
  it("handles junk input", () => {
    expect(isAllowedDomain("no-at-sign", allowed)).toBe(false);
    expect(isAllowedDomain("kid@", allowed)).toBe(false);
    expect(isAllowedDomain("kid@school.edu", [])).toBe(false);
  });
  it("uses the last @ so a quoted local part can't smuggle a domain", () => {
    expect(emailDomain('"a@school.edu"@evil.com')).toBe("evil.com");
  });
});

describe("normalizeDomain", () => {
  it("cleans and validates", () => {
    expect(normalizeDomain(" @School.EDU ")).toBe("school.edu");
    expect(normalizeDomain("nodot")).toBeNull();
    expect(normalizeDomain("a b.com")).toBeNull();
    expect(normalizeDomain("*.school.edu")).toBeNull();
  });
});

describe("decideSignup", () => {
  const base = { email: "kid@school.edu", allowedDomains: allowed };
  it("google + verified + allowed: auto approve", () => {
    expect(decideSignup({ ...base, method: "google", emailVerified: true, smtpConfigured: false }).kind).toBe("auto_approve");
  });
  it("google + unverified email is never auto approved", () => {
    expect(decideSignup({ ...base, method: "google", emailVerified: false, smtpConfigured: true }).kind).toBe("needs_approval");
  });
  it("google + verified but domain not allowed: needs approval", () => {
    expect(decideSignup({ method: "google", email: "x@gmail.com", emailVerified: true, smtpConfigured: true, allowedDomains: allowed }).kind).toBe("needs_approval");
  });
  it("password without SMTP always needs approval, even on an allowed domain", () => {
    expect(decideSignup({ ...base, method: "password", emailVerified: false, smtpConfigured: false }).kind).toBe("needs_approval");
    expect(decideSignup({ ...base, method: "password", emailVerified: true, smtpConfigured: false }).kind).toBe("needs_approval");
  });
  it("password with SMTP on allowed domain waits for verification, then auto approves", () => {
    expect(decideSignup({ ...base, method: "password", emailVerified: false, smtpConfigured: true }).kind).toBe("await_verification");
    expect(decideSignup({ ...base, method: "password", emailVerified: true, smtpConfigured: true }).kind).toBe("auto_approve");
  });
  it("password with SMTP on a non-allowed domain needs approval even when verified", () => {
    expect(decideSignup({ method: "password", email: "x@gmail.com", emailVerified: true, smtpConfigured: true, allowedDomains: allowed }).kind).toBe("needs_approval");
  });
});
