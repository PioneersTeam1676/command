/**
 * Renders an email address that Cloudflare's "Email Address Obfuscation" must leave alone. Cloudflare rewrites
 * addresses in the HTML and injects an inline script (blocked by our CSP), which breaks React hydration and
 * leaves the page's buttons dead. The email_off markers tell Cloudflare to skip this text.
 */
export function EmailText({ email, className }: { email: string; className?: string }) {
  const safe = email.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return <span className={className} dangerouslySetInnerHTML={{ __html: `<!--email_off-->${safe}<!--/email_off-->` }} />;
}
