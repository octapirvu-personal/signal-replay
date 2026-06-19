import type { Bar } from "../data/types";
import type { Bands, Signal, Strategy, StrategyOutput } from "./types";

/**
 * Compute Bollinger Bands using POPULATION standard deviation (divide by N),
 * matching TradingView's `ta.stdev` and the MetaTrader implementation.
 */
export function computeBands(closes: number[], length: number, mult: number): Bands {
  const n = closes.length;
  const basis = new Array<number>(n).fill(NaN);
  const upper = new Array<number>(n).fill(NaN);
  const lower = new Array<number>(n).fill(NaN);
  for (let i = length - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - length + 1; j <= i; j++) sum += closes[j];
    const mean = sum / length;
    let sq = 0;
    for (let j = i - length + 1; j <= i; j++) {
      const d = closes[j] - mean;
      sq += d * d;
    }
    const sd = Math.sqrt(sq / length); // population stdev
    basis[i] = mean;
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { basis, upper, lower };
}

/**
 * Bollinger Band re-entry signals, evaluated on closed candles.
 *
 *  Buy  at i: close[i-1] < lower[i-1] && close[i] > lower[i] && close[i] < basis[i]
 *  Sell at i: close[i-1] > upper[i-1] && close[i] < upper[i] && close[i] > basis[i]
 *
 * First valid signal at i >= length.
 */
export function bbReEntrySignals(bars: Bar[], length: number, mult: number): StrategyOutput {
  const closes = bars.map((b) => b.close);
  const bands = computeBands(closes, length, mult);
  const { basis, upper, lower } = bands;
  const signals: Signal[] = [];
  for (let i = length; i < bars.length; i++) {
    if (Number.isNaN(lower[i - 1]) || Number.isNaN(basis[i])) continue;
    const c = closes[i];
    const c1 = closes[i - 1];
    if (c1 < lower[i - 1] && c > lower[i] && c < basis[i])
      signals.push({ barIndex: i, type: "buy", time: bars[i].time, price: c });
    if (c1 > upper[i - 1] && c < upper[i] && c > basis[i])
      signals.push({ barIndex: i, type: "sell", time: bars[i].time, price: c });
  }
  return { signals, bands };
}

export const bbReEntryStrategy: Strategy = {
  id: "bb-reentry",
  name: "Bollinger Band re-entry",
  params: [
    { key: "length", label: "Length", default: 20, min: 2, max: 500, step: 1 },
    { key: "mult", label: "Mult", default: 2, min: 0.1, max: 10, step: 0.1 },
  ],
  compute(bars, params) {
    const length = Math.max(2, Math.round(params.length ?? 20));
    const mult = Math.max(0.1, params.mult ?? 2);
    return bbReEntrySignals(bars, length, mult);
  },
};
