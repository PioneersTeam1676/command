/** Pure shop rules: no database, so they're cheap to test. */

export const MAX_ORDER_LINES = 20;

export const formatMoney = (cents: number) => {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
};

/** "12", "12.5", "$12.50" -> 1250. Returns null for anything else. */
export function parsePrice(raw: string): number | null {
  const m = /^\$?\s*(\d{1,6})(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}

/** The shop is open when an admin turned it on and the end date (if any) hasn't passed. */
export function isShopOpen(s: { shopEnabled: boolean; shopClosesAt: Date | null }, now = new Date()): boolean {
  return s.shopEnabled && (s.shopClosesAt === null || now < s.shopClosesAt);
}

const PRINT_OK = /^[\p{L}\p{M}\p{N} .,'’&#!/\-]+$/u;

/**
 * What the buyer typed for printing ("Alex", "Alexander", "Alex R."). Trimmed, inner spaces collapsed.
 * Only letters, digits and a few marks are allowed so nothing odd reaches the print shop (or an email).
 */
export function normalizePrintText(raw: string, opts: { mode: "none" | "optional" | "required"; max: number }): { ok: true; value: string | null } | { ok: false; error: string } {
  if (opts.mode === "none") return { ok: true, value: null };
  const value = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!value) return opts.mode === "required" ? { ok: false, error: "Type what should be printed." } : { ok: true, value: null };
  if (value.length > opts.max) return { ok: false, error: `Keep it to ${opts.max} characters or fewer.` };
  if (!PRINT_OK.test(value)) return { ok: false, error: "Use letters, numbers and . , ' & # ! / - only." };
  return { ok: true, value };
}

export const orderTotal = (lines: { unitPriceCents: number; qty: number }[]) => lines.reduce((n, l) => n + l.unitPriceCents * l.qty, 0);
