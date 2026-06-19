import type { Bar } from "./types";

/** Decimal places of a value, probed up to `max` (returns `max` if more). */
function decimalsOf(v: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  for (let d = 0; d < max; d++) {
    const f = Math.pow(10, d);
    if (Math.abs(v * f - Math.round(v * f)) < 1e-7 * Math.max(1, Math.abs(v))) return d;
  }
  return max;
}

/**
 * Infer how many decimals a price series needs by scanning O/H/L/C, the way
 * TradingView derives precision from the instrument. Clamped to [min, max] so
 * low-precision data keeps a sensible 2-dp default and high-precision (forex,
 * crypto) gets up to 5. Samples large datasets to stay cheap.
 */
export function detectPricePrecision(bars: Bar[], min = 2, max = 5): number {
  if (!bars.length) return min;
  const stride = bars.length > 4000 ? Math.ceil(bars.length / 4000) : 1;
  let p = 0;
  for (let i = 0; i < bars.length; i += stride) {
    const b = bars[i];
    p = Math.max(p, decimalsOf(b.open, max), decimalsOf(b.high, max), decimalsOf(b.low, max), decimalsOf(b.close, max));
    if (p >= max) return max;
  }
  return Math.min(max, Math.max(min, p));
}

/** The smallest tick for a given decimal precision (lightweight-charts minMove). */
export function minMoveFor(precision: number): number {
  return 1 / Math.pow(10, precision);
}
