/**
 * Sign-up approval rules (spec 4.3). Pure functions so the policy is easy to test.
 *
 * - Google with a verified email on an allowed domain: approved automatically.
 * - Password sign-up: a typed email can't be trusted. With SMTP the address must be verified by
 *   link first, and only then does the allowed-domain auto-approval apply. Without SMTP every
 *   password sign-up goes to an admin.
 * - Anyone else creates an access request.
 */

export type SignupMethod = "google" | "password";

export type SignupDecision =
  | { kind: "auto_approve" }
  | { kind: "needs_approval" }
  /** Password sign-up on an allowed domain, waiting for the emailed link. Becomes auto_approve when verified. */
  | { kind: "await_verification" };

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}

/** Exact domain match, case-insensitive, no implied subdomains. */
export function isAllowedDomain(email: string, allowedDomains: readonly string[]): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  return allowedDomains.some((d) => d.trim().toLowerCase() === domain);
}

export function normalizeDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^@/, "");
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d) ? d : null;
}

export function decideSignup(input: {
  method: SignupMethod;
  email: string;
  /** For Google: the `email_verified` claim. For password: whether the emailed link was clicked. */
  emailVerified: boolean;
  smtpConfigured: boolean;
  allowedDomains: readonly string[];
}): SignupDecision {
  const allowed = isAllowedDomain(input.email, input.allowedDomains);
  if (input.method === "google") {
    return input.emailVerified && allowed ? { kind: "auto_approve" } : { kind: "needs_approval" };
  }
  if (!allowed || !input.smtpConfigured) return { kind: "needs_approval" };
  return input.emailVerified ? { kind: "auto_approve" } : { kind: "await_verification" };
}
