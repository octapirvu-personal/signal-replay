import { describe, it, expect } from "vitest";
import { buildEntry, journalSummary, pipSizeFor, formatDuration } from "../journal";
import type { Trade } from "../trades";
import type { Bar } from "../../data/types";

const ctx = { fallbackSymbol: "EURUSD", defaultSize: 1, defaultPipValue: 10, precision: 5 };

const bar = (time: number, o: number, h: number, l: number, c: number): Bar => ({ time, open: o, high: h, low: l, close: c, volume: 0 });

// entry bar at 0; subsequent bars drive the outcome
function series(...rest: Bar[]): Bar[] {
  return [bar(1000, 1.1, 1.1, 1.1, 1.1), ...rest];
}

const baseLong: Trade = {
  id: "t1",
  direction: "long",
  entryTime: 1000,
  entryBarIndex: 0,
  entryPrice: 1.1,
  sl: 1.099, // 10 pips risk
  tp: 1.102, // 20 pips reward
  createdAt: 0,
  symbol: "EURUSD",
  size: 1,
  pipSize: 0.0001,
  pipValue: 10,
};

describe("pipSizeFor", () => {
  it("FX convention", () => {
    expect(pipSizeFor(5)).toBeCloseTo(0.0001, 10);
    expect(pipSizeFor(3)).toBeCloseTo(0.01, 10);
    expect(pipSizeFor(2)).toBeCloseTo(0.1, 10);
  });
});

describe("buildEntry", () => {
  it("long win: +20 pips, $200, 2.0 R:R", () => {
    const bars = series(bar(4600, 1.1, 1.1025, 1.0995, 1.101)); // high hits TP
    const e = buildEntry(bars, baseLong, ctx);
    expect(e.status).toBe("win");
    expect(e.rr).toBeCloseTo(2, 5);
    expect(e.rewardPips).toBeCloseTo(20, 5);
    expect(e.riskPips).toBeCloseTo(10, 5);
    expect(e.resultPips).toBeCloseTo(20, 5);
    expect(e.pnl).toBeCloseTo(200, 5);
    expect(e.exitPrice).toBeCloseTo(1.102, 5);
    expect(e.durationBars).toBe(1);
    expect(e.durationSec).toBe(3600);
  });

  it("long loss: −10 pips, −$100", () => {
    const bars = series(bar(4600, 1.1, 1.1005, 1.0985, 1.099)); // low hits SL
    const e = buildEntry(bars, baseLong, ctx);
    expect(e.status).toBe("loss");
    expect(e.resultPips).toBeCloseTo(-10, 5);
    expect(e.pnl).toBeCloseTo(-100, 5);
  });

  it("short win: low hits TP", () => {
    const short: Trade = { ...baseLong, id: "s1", direction: "short", sl: 1.101, tp: 1.098 };
    const bars = series(bar(4600, 1.1, 1.1005, 1.0975, 1.098));
    const e = buildEntry(bars, short, ctx);
    expect(e.status).toBe("win");
    expect(e.resultPips).toBeCloseTo(20, 5);
    expect(e.pnl).toBeCloseTo(200, 5);
  });

  it("open trade marks to market on the last close", () => {
    const bars = series(bar(4600, 1.1, 1.1009, 1.0995, 1.1005)); // neither level hit
    const e = buildEntry(bars, baseLong, ctx);
    expect(e.status).toBe("open");
    expect(e.exitPrice).toBeNull();
    expect(e.resultPips).toBeCloseTo(5, 5); // (1.1005-1.1)/0.0001
  });

  it("honors size and $/pip for money P&L", () => {
    const bars = series(bar(4600, 1.1, 1.1025, 1.0995, 1.101));
    const e = buildEntry(bars, { ...baseLong, size: 2, pipValue: 5 }, ctx);
    expect(e.pnl).toBeCloseTo(20 * 5 * 2, 5); // 200
  });
});

describe("journalSummary", () => {
  it("aggregates win rate, P&L and extremes over closed trades", () => {
    const win = buildEntry(series(bar(4600, 1.1, 1.1025, 1.0995, 1.101)), baseLong, ctx);
    const loss = buildEntry(series(bar(4600, 1.1, 1.1005, 1.0985, 1.099)), { ...baseLong, id: "t2" }, ctx);
    const s = journalSummary([win, loss]);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.winRate).toBeCloseTo(0.5, 5);
    expect(s.totalPnl).toBeCloseTo(100, 5); // +200 - 100
    expect(s.largestWin).toBeCloseTo(200, 5);
    expect(s.largestLoss).toBeCloseTo(-100, 5);
  });
});

describe("formatDuration", () => {
  it("formats compactly", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(90000)).toBe("1d 1h");
    expect(formatDuration(1800)).toBe("30m");
  });
});
