import type { ParseResult } from "../data/types";

/**
 * Deterministic synthetic OHLC series for the "load sample" button — a random
 * walk with volatility regimes so the BB re-entry strategy actually fires.
 */
export function makeSample(bars = 1500): ParseResult {
  // simple seeded LCG for reproducibility (no Math.random)
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const start = Date.UTC(2023, 0, 2, 0, 0, 0) / 1000;
  const step = 60 * 60; // hourly
  const out: ParseResult["bars"] = [];
  let price = 100;
  for (let i = 0; i < bars; i++) {
    const vol = 0.6 + 1.4 * Math.abs(Math.sin(i / 120)); // volatility regimes
    const drift = Math.sin(i / 240) * 0.05;
    const open = price;
    const change = (rnd() - 0.5) * 2 * vol + drift;
    const close = Math.max(1, open + change);
    const high = Math.max(open, close) + rnd() * vol;
    const low = Math.min(open, close) - rnd() * vol;
    out.push({
      time: start + i * step,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(500 + rnd() * 1500),
    });
    price = close;
  }
  return {
    bars: out,
    csvFlags: null,
    hasCsvSignals: false,
    format: "generic",
    map: { date: 0, time: -1, open: 1, high: 2, low: 3, close: 4, volume: 5, buy: -1, sell: -1 },
    headers: ["time", "open", "high", "low", "close", "volume"],
    confident: true,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
