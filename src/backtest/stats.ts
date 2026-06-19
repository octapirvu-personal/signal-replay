import type { Bar } from "../data/types";
import type { Signal } from "../signals/types";
import type { DecisionRecord } from "../state/app";

/** Direction-aware outcome of a single "take" decision over a fixed bar horizon. */
export interface DecisionOutcome {
  signalTime: number;
  type: "buy" | "sell";
  favorablePct: number; // best move in trade direction (%)
  adversePct: number; // worst move against the trade (%, <= 0)
  horizonPct: number; // direction-aware return at the horizon (%)
  win: boolean;
}

export interface DecisionStats {
  decided: number;
  takes: number;
  skips: number;
  evaluated: number; // takes with enough forward bars to evaluate
  winRate: number; // 0..1 over evaluated
  avgFavorable: number; // %
  avgAdverse: number; // %
  expectancy: number; // mean horizon return %
  histogram: HistogramBin[];
  outcomes: DecisionOutcome[];
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

/**
 * Outcomes of every "take" decision, measured over `horizon` bars after the
 * signal bar. Favorable/adverse are MFE/MAE; horizon return is the signed move
 * in the trade's direction at the horizon close.
 */
export function decisionStats(
  bars: Bar[],
  signals: Signal[],
  decisions: Record<number, DecisionRecord>,
  horizon: number,
): DecisionStats {
  const byTime = new Map<number, Signal>();
  for (const s of signals) byTime.set(s.time, s);

  let takes = 0;
  let skips = 0;
  const outcomes: DecisionOutcome[] = [];

  for (const [timeStr, rec] of Object.entries(decisions)) {
    if (rec.decision === "take") takes++;
    else if (rec.decision === "skip") skips++;
    if (rec.decision !== "take") continue;

    const sig = byTime.get(Number(timeStr));
    if (!sig) continue;
    const end = Math.min(bars.length - 1, sig.barIndex + horizon);
    if (end <= sig.barIndex) continue; // not enough forward data yet

    const entry = sig.price;
    if (!(entry > 0)) continue;
    let hi = -Infinity;
    let lo = Infinity;
    for (let i = sig.barIndex + 1; i <= end; i++) {
      hi = Math.max(hi, bars[i].high);
      lo = Math.min(lo, bars[i].low);
    }
    const closeEnd = bars[end].close;
    const pct = (v: number) => (v / entry) * 100;

    let favorablePct: number;
    let adversePct: number;
    let horizonPct: number;
    if (sig.type === "buy") {
      favorablePct = pct(hi - entry);
      adversePct = pct(lo - entry);
      horizonPct = pct(closeEnd - entry);
    } else {
      favorablePct = pct(entry - lo);
      adversePct = pct(entry - hi);
      horizonPct = pct(entry - closeEnd);
    }
    outcomes.push({
      signalTime: sig.time,
      type: sig.type,
      favorablePct,
      adversePct,
      horizonPct,
      win: horizonPct > 0,
    });
  }

  const evaluated = outcomes.length;
  const wins = outcomes.filter((o) => o.win).length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  return {
    decided: takes + skips,
    takes,
    skips,
    evaluated,
    winRate: evaluated ? wins / evaluated : 0,
    avgFavorable: mean(outcomes.map((o) => o.favorablePct)),
    avgAdverse: mean(outcomes.map((o) => o.adversePct)),
    expectancy: mean(outcomes.map((o) => o.horizonPct)),
    histogram: makeHistogram(
      outcomes.map((o) => o.horizonPct),
      9,
    ),
    outcomes,
  };
}

/** Bucket values into `binCount` symmetric bins centered on zero. */
export function makeHistogram(values: number[], binCount: number): HistogramBin[] {
  if (!values.length) return [];
  const maxAbs = Math.max(0.0001, ...values.map((v) => Math.abs(v)));
  const span = (maxAbs * 2) / binCount;
  const bins: HistogramBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const from = -maxAbs + i * span;
    bins.push({ from, to: from + span, count: 0 });
  }
  for (const v of values) {
    let idx = Math.floor((v + maxAbs) / span);
    if (idx < 0) idx = 0;
    if (idx >= binCount) idx = binCount - 1;
    bins[idx].count++;
  }
  return bins;
}
