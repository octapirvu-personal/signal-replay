import type { Bar } from "../data/types";
import type { Signal, Strategy, StrategyOutput } from "./types";

export interface HammerParams {
  bodyMax: number; // max body size as % of range
  hLowerMin: number; // hammer: min lower shadow %
  hUpperWiggle: number; // hammer: max upper shadow %
  ihUpperMin: number; // inverted hammer: min upper shadow %
  ihLowerWiggle: number; // inverted hammer: max lower shadow %
}

/**
 * Hammer & Inverted Hammer detector (port of the TradingView Pine indicator).
 * Each detected candle becomes a signal: bullish (close ≥ open) → buy, bearish → sell,
 * so they plot and navigate exactly like the Bollinger signals.
 */
export function hammerSignals(bars: Bar[], p: HammerParams): StrategyOutput {
  const signals: Signal[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const range = b.high - b.low;
    if (range <= 0) continue;
    const bodyTop = Math.max(b.open, b.close);
    const bodyBot = Math.min(b.open, b.close);
    const bodyPct = ((bodyTop - bodyBot) / range) * 100;
    const upperPct = ((b.high - bodyTop) / range) * 100;
    const lowerPct = ((bodyBot - b.low) / range) * 100;

    const isHammer = bodyPct <= p.bodyMax && upperPct <= p.hUpperWiggle && lowerPct >= p.hLowerMin;
    const isInvHammer = bodyPct <= p.bodyMax && lowerPct <= p.ihLowerWiggle && upperPct >= p.ihUpperMin;

    if (isHammer || isInvHammer) {
      signals.push({ barIndex: i, type: b.close >= b.open ? "buy" : "sell", time: b.time, price: b.close });
    }
  }
  return { signals };
}

export const hammerStrategy: Strategy = {
  id: "hammer",
  name: "Hammer & Inverted Hammer",
  params: [
    { key: "bodyMax", label: "Body% max", default: 35, min: 1, max: 80, step: 1 },
    { key: "hLowerMin", label: "Ham low%", default: 55, min: 10, max: 95, step: 1 },
    { key: "hUpperWiggle", label: "Ham up wig%", default: 5, min: 0, max: 50, step: 0.5 },
    { key: "ihUpperMin", label: "InvH up%", default: 55, min: 10, max: 95, step: 1 },
    { key: "ihLowerWiggle", label: "InvH low wig%", default: 5, min: 0, max: 50, step: 0.5 },
  ],
  compute(bars, params) {
    return hammerSignals(bars, {
      bodyMax: params.bodyMax ?? 35,
      hLowerMin: params.hLowerMin ?? 55,
      hUpperWiggle: params.hUpperWiggle ?? 5,
      ihUpperMin: params.ihUpperMin ?? 55,
      ihLowerWiggle: params.ihLowerWiggle ?? 5,
    });
  },
};
