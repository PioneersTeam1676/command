import { describe, expect, it } from "vitest";
import { formatMoney, isShopOpen, normalizePrintText, orderTotal, parsePrice } from "./shop-rules";

describe("shop rules", () => {
  it("formats and parses prices", () => {
    expect(formatMoney(2500)).toBe("$25");
    expect(formatMoney(2550)).toBe("$25.50");
    expect(parsePrice("25")).toBe(2500);
    expect(parsePrice("$25.5")).toBe(2550);
    expect(parsePrice("25.05")).toBe(2505);
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice("1.234")).toBeNull();
    expect(parsePrice("-3")).toBeNull();
  });

  it("opens only when enabled and before the end date", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    expect(isShopOpen({ shopEnabled: false, shopClosesAt: null }, now)).toBe(false);
    expect(isShopOpen({ shopEnabled: true, shopClosesAt: null }, now)).toBe(true);
    expect(isShopOpen({ shopEnabled: true, shopClosesAt: new Date("2026-10-02T00:00:00Z") }, now)).toBe(true);
    expect(isShopOpen({ shopEnabled: true, shopClosesAt: new Date("2026-09-30T00:00:00Z") }, now)).toBe(false);
  });

  it("accepts any name style and tidies spaces", () => {
    const o = { mode: "required", max: 30 } as const;
    for (const v of ["Alex", "Alexander", "Alex R.", "Alex Radu", "  Alex   Radu "]) expect(normalizePrintText(v, o).ok).toBe(true);
    expect(normalizePrintText("  Alex   Radu ", o)).toEqual({ ok: true, value: "Alex Radu" });
    expect(normalizePrintText("José Núñez", o)).toEqual({ ok: true, value: "José Núñez" });
  });

  it("enforces required, optional, none, length and characters", () => {
    expect(normalizePrintText("", { mode: "required", max: 10 }).ok).toBe(false);
    expect(normalizePrintText("", { mode: "optional", max: 10 })).toEqual({ ok: true, value: null });
    expect(normalizePrintText("anything", { mode: "none", max: 10 })).toEqual({ ok: true, value: null });
    expect(normalizePrintText("a".repeat(11), { mode: "required", max: 10 }).ok).toBe(false);
    expect(normalizePrintText("<b>x</b>", { mode: "required", max: 30 }).ok).toBe(false);
    expect(normalizePrintText("line\nbreak", { mode: "required", max: 30 })).toEqual({ ok: true, value: "line break" });
  });

  it("totals an order", () => {
    expect(orderTotal([{ unitPriceCents: 2500, qty: 2 }, { unitPriceCents: 1000, qty: 1 }])).toBe(6000);
  });
});
