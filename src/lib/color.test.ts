import { describe, expect, it } from "vitest";
import { contrastRatio, deriveAccent, hexToRgb, DEFAULT_ACCENT, AA } from "./color";

const best = (hex: string) => {
  const rgb = hexToRgb(hex)!;
  return Math.max(contrastRatio(rgb, [255, 255, 255]), contrastRatio(rgb, [10, 10, 10]));
};

describe("deriveAccent", () => {
  it("keeps a good accent unchanged in spirit and provides a readable foreground", () => {
    const a = deriveAccent("#0070f3");
    expect(a.foreground).toBe("#ffffff");
    expect(contrastRatio(hexToRgb(a.base)!, hexToRgb(a.foreground)!)).toBeGreaterThanOrEqual(AA);
  });

  it("auto-adjusts mid-tone colors that fail AA against both white and black", () => {
    const a = deriveAccent("#808080");
    expect(best(a.base)).toBeGreaterThanOrEqual(AA);
  });

  it("falls back to the default for invalid input", () => {
    expect(deriveAccent("nope").base).toBe(deriveAccent(DEFAULT_ACCENT).base);
  });

  it("always yields AA-readable foreground for a sweep of hues", () => {
    for (let h = 0; h < 360; h += 30) {
      const hex = `#${[0, 1, 2].map((i) => Math.round(128 + 127 * Math.sin(((h + i * 120) * Math.PI) / 180)).toString(16).padStart(2, "0")).join("")}`;
      const a = deriveAccent(hex);
      expect(contrastRatio(hexToRgb(a.base)!, hexToRgb(a.foreground)!)).toBeGreaterThanOrEqual(AA);
    }
  });
});
