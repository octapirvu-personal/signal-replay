import type { Bar } from "../data/types";
import { evaluateTrade, type Trade, type TradeDirection, type TradeStatus } from "./trades";

/**
 * Pip size from quote precision, FX convention: a pip is one-tenth of the
 * quote's smallest place — 0.0001 on a 5-decimal pair, 0.01 on a 3-decimal
 * (JPY) pair, etc. (the last decimal is the "pipette").
 */
export function pipSizeFor(precision: number): number {
  const p = Math.max(1, precision);
  return Math.pow(10, -(p - 1));
}

/** Fallbacks for trades created before per-trade snapshots existed. */
export interface JournalContext {
  fallbackSymbol: string;
  defaultSize: number;
  defaultPipValue: number;
  precision: number;
}

/** A fully-resolved journal row computed from a planned trade + the price data. */
export interface JournalEntry {
  id: string;
  symbol: string;
  direction: TradeDirection;
  entryTime: number;
  entryBarIndex: number;
  entryPrice: number;
  tp: number;
  sl: number;
  size: number;
  rr: number;
  pipSize: number;
  pipValue: number;
  status: TradeStatus;
  exitTime: number | null;
  exitBarIndex: number | null;
  exitPrice: number | null;
  rMultiple: number;
  riskPips: number; // planned SL distance, pips
  rewardPips: number; // planned TP distance, pips
  resultPips: number; // realized (closed) or unrealized (open) signed pips
  pnl: number; // money: resultPips × pipValue × size
  durationBars: number | null;
  durationSec: number | null;
  note?: string;
  createdAt: number;
}

/** Resolve one trade into a journal entry (pips, money P&L, duration, outcome). */
export function buildEntry(bars: Bar[], trade: Trade, ctx: JournalContext): JournalEntry {
  const pipSize = trade.pipSize ?? pipSizeFor(ctx.precision);
  const size = trade.size ?? ctx.defaultSize;
  const pipValue = trade.pipValue ?? ctx.defaultPipValue;
  const symbol = trade.symbol ?? ctx.fallbackSymbol;

  const r = evaluateTrade(bars, trade);
  const dir = trade.direction === "long" ? 1 : -1;
  const lastClose = bars.length ? bars[bars.length - 1].close : trade.entryPrice;
  // realized exit price if closed; otherwise mark-to-market on the last close
  const refPrice = r.exitPrice ?? lastClose;
  const safePip = pipSize > 0 ? pipSize : 1;
  const resultPips = (dir * (refPrice - trade.entryPrice)) / safePip;
  const riskPips = Math.abs(trade.entryPrice - trade.sl) / safePip;
  const rewardPips = Math.abs(trade.tp - trade.entryPrice) / safePip;
  const pnl = resultPips * pipValue * size;

  const exitTime = r.exitBarIndex != null ? (bars[r.exitBarIndex]?.time ?? null) : null;
  const durationBars = r.exitBarIndex != null ? r.exitBarIndex - trade.entryBarIndex : null;
  const durationSec = exitTime != null ? exitTime - trade.entryTime : null;

  return {
    id: trade.id,
    symbol,
    direction: trade.direction,
    entryTime: trade.entryTime,
    entryBarIndex: trade.entryBarIndex,
    entryPrice: trade.entryPrice,
    tp: trade.tp,
    sl: trade.sl,
    size,
    rr: r.rr,
    pipSize,
    pipValue,
    status: r.status,
    exitTime,
    exitBarIndex: r.exitBarIndex,
    exitPrice: r.exitPrice,
    rMultiple: r.rMultiple,
    riskPips,
    rewardPips,
    resultPips,
    pnl,
    durationBars,
    durationSec,
    note: trade.note,
    createdAt: trade.createdAt,
  };
}

export function buildJournal(bars: Bar[], trades: Trade[], ctx: JournalContext): JournalEntry[] {
  return trades.map((t) => buildEntry(bars, t, ctx));
}

export interface JournalSummary {
  total: number;
  wins: number;
  losses: number;
  open: number;
  winRate: number; // over closed
  totalPnl: number; // money, closed
  avgRR: number; // planned R:R over all
  largestWin: number; // money
  largestLoss: number; // money (≤ 0)
  totalResultPips: number; // closed
}

export function journalSummary(entries: JournalEntry[]): JournalSummary {
  const closed = entries.filter((e) => e.status === "win" || e.status === "loss");
  const wins = closed.filter((e) => e.status === "win").length;
  const losses = closed.filter((e) => e.status === "loss").length;
  const pnls = closed.map((e) => e.pnl);
  return {
    total: entries.length,
    wins,
    losses,
    open: entries.filter((e) => e.status === "open").length,
    winRate: closed.length ? wins / closed.length : 0,
    totalPnl: pnls.reduce((a, b) => a + b, 0),
    avgRR: entries.length ? entries.reduce((a, e) => a + e.rr, 0) / entries.length : 0,
    largestWin: pnls.length ? Math.max(0, ...pnls) : 0,
    largestLoss: pnls.length ? Math.min(0, ...pnls) : 0,
    totalResultPips: closed.reduce((a, e) => a + e.resultPips, 0),
  };
}

/** Compact human duration from seconds: "3h", "2d 4h", "45m". */
export function formatDuration(sec: number | null): string {
  if (sec == null) return "—";
  if (sec <= 0) return "0m";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}
