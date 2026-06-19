import type { Bar } from "../data/types";

export type TradeDirection = "long" | "short";

/** A planned trade: entry anchored in (time, price), with SL/TP price levels. */
export interface Trade {
  id: string;
  direction: TradeDirection;
  entryTime: number;
  entryBarIndex: number;
  entryPrice: number;
  sl: number;
  tp: number;
  note?: string;
  createdAt: number;
  /** Snapshots captured when the trade is placed, so the journal stays stable. */
  symbol?: string;
  size?: number;
  /** Price distance of one pip for this instrument (FX convention). */
  pipSize?: number;
  /** Account-currency value of one pip per 1.0 of position size. */
  pipValue?: number;
}

export type TradeStatus = "win" | "loss" | "open" | "invalid";

export interface TradeResult {
  status: TradeStatus;
  rr: number; // planned reward:risk
  rMultiple: number; // realized (or unrealized for open) R
  exitBarIndex: number | null;
  exitPrice: number | null;
}

/**
 * Evaluate a trade against forward bars: whichever of SL/TP is touched first
 * decides the outcome. If a single bar straddles both, SL is assumed first
 * (conservative). If neither is hit, the trade is "open" and R is unrealized
 * from the last bar's close.
 */
export function evaluateTrade(bars: Bar[], trade: Trade): TradeResult {
  const { direction, entryBarIndex, entryPrice, sl, tp } = trade;
  const risk = Math.abs(entryPrice - sl);
  const reward = Math.abs(tp - entryPrice);
  const rr = risk > 0 ? reward / risk : 0;

  // basic validity: SL/TP on the correct sides of entry
  const valid =
    risk > 0 &&
    reward > 0 &&
    (direction === "long" ? sl < entryPrice && tp > entryPrice : sl > entryPrice && tp < entryPrice);
  if (!valid) return { status: "invalid", rr, rMultiple: 0, exitBarIndex: null, exitPrice: null };

  for (let i = entryBarIndex + 1; i < bars.length; i++) {
    const b = bars[i];
    if (direction === "long") {
      const hitSL = b.low <= sl;
      const hitTP = b.high >= tp;
      if (hitSL) return { status: "loss", rr, rMultiple: -1, exitBarIndex: i, exitPrice: sl };
      if (hitTP) return { status: "win", rr, rMultiple: rr, exitBarIndex: i, exitPrice: tp };
    } else {
      const hitSL = b.high >= sl;
      const hitTP = b.low <= tp;
      if (hitSL) return { status: "loss", rr, rMultiple: -1, exitBarIndex: i, exitPrice: sl };
      if (hitTP) return { status: "win", rr, rMultiple: rr, exitBarIndex: i, exitPrice: tp };
    }
  }

  // still open — unrealized R from the last close
  const last = bars[bars.length - 1];
  const move = direction === "long" ? last.close - entryPrice : entryPrice - last.close;
  return { status: "open", rr, rMultiple: move / risk, exitBarIndex: null, exitPrice: null };
}

export interface TradeStats {
  total: number;
  wins: number;
  losses: number;
  open: number;
  winRate: number; // over closed trades
  avgR: number; // mean R over closed trades
  expectancy: number; // same as avgR; named for clarity
  totalR: number; // sum of closed R
}

export function tradeStats(results: TradeResult[]): TradeStats {
  const closed = results.filter((r) => r.status === "win" || r.status === "loss");
  const wins = closed.filter((r) => r.status === "win").length;
  const losses = closed.filter((r) => r.status === "loss").length;
  const open = results.filter((r) => r.status === "open").length;
  const totalR = closed.reduce((a, r) => a + r.rMultiple, 0);
  return {
    total: results.length,
    wins,
    losses,
    open,
    winRate: closed.length ? wins / closed.length : 0,
    avgR: closed.length ? totalR / closed.length : 0,
    expectancy: closed.length ? totalR / closed.length : 0,
    totalR,
  };
}

/** Suggested default SL/TP for a fast one-click trade, given a reference price. */
export function defaultLevels(
  direction: TradeDirection,
  entryPrice: number,
  riskPct: number,
  rr: number,
): { sl: number; tp: number } {
  const risk = entryPrice * (riskPct / 100);
  return direction === "long"
    ? { sl: entryPrice - risk, tp: entryPrice + risk * rr }
    : { sl: entryPrice + risk, tp: entryPrice - risk * rr };
}
