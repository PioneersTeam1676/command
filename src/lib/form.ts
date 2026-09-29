import type { z } from "zod";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  /** Echoed back so a failed submit doesn't clear non-secret fields. */
  values?: Record<string, string>;
  /** Arbitrary one-off data such as a temporary password to show once. */
  data?: Record<string, string>;
};

/** Validate FormData against a Zod schema; returns data or a ready-to-return FormState. */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
  opts: { keepValues?: string[] } = {},
): { ok: true; data: z.infer<S> } | { ok: false; state: FormState } {
  const raw: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") raw[k] = v;
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  const values = Object.fromEntries((opts.keepValues ?? []).map((k) => [k, raw[k] ?? ""]));
  return { ok: false, state: { error: "Please fix the highlighted fields.", fieldErrors, values } };
}

/** Only allow same-site relative redirects. */
export function safeNext(next: string | undefined | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}
