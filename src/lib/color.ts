/** Accent color derivation in OKLCH with WCAG AA enforcement. */

type Rgb = [number, number, number];
type Oklch = { l: number; c: number; h: number };

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

const toLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055;
  return s * 255;
};

export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function rgbToOklch(rgb: Rgb): Oklch {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return [fromLinear(r), fromLinear(g), fromLinear(bl)];
}

const clampC = (o: Oklch): Oklch => {
  // Reduce chroma until the color fits inside sRGB.
  let c = o.c;
  for (let i = 0; i < 30; i++) {
    const [r, g, b] = oklchToRgb({ ...o, c });
    if ([r, g, b].every((v) => v >= -0.5 && v <= 255.5)) break;
    c *= 0.93;
  }
  return { ...o, c };
};

const WHITE: Rgb = [255, 255, 255];
const NEAR_BLACK: Rgb = [10, 10, 10];
export const DEFAULT_ACCENT = "#0070f3";
export const AA = 4.5;

export type AccentScale = {
  base: string;
  hover: string;
  subtle: string;
  subtleDark: string;
  foreground: string;
  adjusted: boolean;
};

/**
 * Derive base/hover/subtle/foreground from a hex accent. If the base color does not reach WCAG AA
 * (4.5:1) against either white or near-black text, its lightness is nudged until one does.
 * Falls back to the default accent when the input is not a valid 6-digit hex.
 */
export function deriveAccent(input: string): AccentScale {
  const rgb = hexToRgb(input) ?? hexToRgb(DEFAULT_ACCENT)!;
  let o = rgbToOklch(rgb);
  let adjusted = false;
  const best = (r: Rgb) => Math.max(contrastRatio(r, WHITE), contrastRatio(r, NEAR_BLACK));
  let guard = 0;
  while (best(oklchToRgb(o)) < AA && guard++ < 60) {
    // Move away from mid-lightness, toward whichever extreme is closer.
    o = clampC({ ...o, l: o.l < 0.6 ? Math.max(0, o.l - 0.02) : Math.min(1, o.l + 0.02) });
    adjusted = true;
  }
  const baseRgb = oklchToRgb(clampC(o));
  const fg = contrastRatio(baseRgb, WHITE) >= AA ? WHITE : NEAR_BLACK;
  const hoverL = o.l < 0.6 ? o.l - 0.05 : o.l - 0.06;
  return {
    base: rgbToHex(baseRgb),
    hover: rgbToHex(oklchToRgb(clampC({ ...o, l: Math.max(0, hoverL) }))),
    subtle: rgbToHex(oklchToRgb(clampC({ l: 0.96, c: Math.min(o.c, 0.04), h: o.h }))),
    subtleDark: rgbToHex(oklchToRgb(clampC({ l: 0.22, c: Math.min(o.c, 0.06), h: o.h }))),
    foreground: rgbToHex(fg),
    adjusted,
  };
}

export const isHexColor = (v: string) => /^#[0-9a-f]{6}$/i.test(v);
