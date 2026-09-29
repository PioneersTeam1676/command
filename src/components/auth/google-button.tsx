import { Button } from "@/components/ui/button";

/** Plain link (not a form) so OAuth navigation isn't blocked by form-action CSP. */
export function GoogleButton({ intent = "login", next, recommended = true }: { intent?: "login" | "parent" | "setup"; next?: string; recommended?: boolean }) {
  const qs = new URLSearchParams({ intent });
  if (next) qs.set("next", next);
  return (
    <Button asChild variant="secondary" size="lg" className="w-full">
      <a href={`/auth/google?${qs}`}>
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11l4-3.1Z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
        </svg>
        Continue with Google
        {recommended ? <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs md:text-[11px] font-medium">Recommended</span> : null}
      </a>
    </Button>
  );
}

export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted" role="separator">
      <span className="h-px flex-1 bg-border" />
      or use your email
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
