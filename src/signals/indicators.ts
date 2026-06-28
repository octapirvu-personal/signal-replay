import type { Bar } from "../data/types";
import type { Bands, OverlayLine } from "./types";
import { computeBands } from "./bbReentry";

/** Available indicators the user can toggle. */
export const INDICATORS = [
  { key: "bands", label: "Bollinger Bands" },
  { key: "ema", label: "Triple EMA (9 / 20 / 50)" },
] as const;
export type IndicatorKey = (typeof INDICATORS)[number]["key"];

export interface IndicatorPrefs {
  showBands: boolean;
  showEma: boolean;
}

/** Exponential moving average, seeded with the SMA at `period`; NaN before warmup. */
export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out = new Array<number>(values.length).fill(NaN);
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      prev = sum / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

const EMA_SPECS = [
  { id: "ema-9", period: 9, color: "#f0b429" },
  { id: "ema-20", period: 20, color: "#22d3ee" },
  { id: "ema-50", period: 50, color: "#a855f7" },
];

/** Build the list of indicator overlay lines for the currently enabled indicators. */
export function buildOverlays(bars: Bar[], bands: Bands | null, prefs: IndicatorPrefs): OverlayLine[] {
  const out: OverlayLine[] = [];
  if (prefs.showBands) {
    // Use the strategy's bands when available (BB strategy), else a default 20/2
    // so the bands still draw under non-BB strategies (e.g. Hammer).
    const b = bands ?? computeBands(bars.map((x) => x.close), 20, 2);
    out.push({ id: "bb-upper", color: "rgba(239,83,80,.6)", values: b.upper });
    out.push({ id: "bb-basis", color: "rgba(59,130,246,.6)", values: b.basis });
    out.push({ id: "bb-lower", color: "rgba(38,166,154,.6)", values: b.lower });
  }
  if (prefs.showEma) {
    const close = bars.map((b) => b.close);
    for (const s of EMA_SPECS) out.push({ id: s.id, color: s.color, values: ema(close, s.period), lineWidth: 0.5 });
  }
  return out;
}
