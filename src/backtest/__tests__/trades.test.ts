import { describe, it, expect } from "vitest";
import { evaluateTrade, tradeStats, defaultLevels, type Trade } from "../trades";
import { decisionStats } from "../stats";
import type { Bar } from "../../data/types";
import type { Signal } from "../../signals/types";

const bar = (i: number, o: number, h: number, l: number, c: number): Bar => ({
  time: i + 1,
  open: o,
  high: h,
  low: l,
  close: c,
});

const trade = (over: Partial<Trade>): Trade => ({
  id: "t",
  direction: "long",
  entryTime: 1,
  entryBarIndex: 0,
  entryPrice: 100,
  sl: 98,
  tp: 104,
  createdAt: 0,
  ...over,
});

describe("evaluateTrade", () => {
  it("long TP hit → win at planned RR", () => {
    const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99, 100), bar(2, 100, 105, 100, 104)];
    const r = evaluateTrade(bars, trade({}));
    expect(r.status).toBe("win");
    expect(r.rr).toBeCloseTo(2, 10); // reward 4 / risk 2
    expect(r.rMultiple).toBeCloseTo(2, 10);
    expect(r.exitBarIndex).toBe(2);
  });

  it("long SL hit → loss of 1R", () => {
    const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 97, 98)];
    const r = evaluateTrade(bars, trade({}));
    expect(r.status).toBe("loss");
    expect(r.rMultiple).toBe(-1);
  });

  it("straddle bar resolves to SL first (conservative)", () => {
    const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 105, 97, 100)]; // hits both 104 and 98
    const r = evaluateTrade(bars, trade({}));
    expect(r.status).toBe("loss");
  });

  it("short TP hit → win", () => {
    const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 95, 96)];
    const r = evaluateTrade(bars, trade({ direction: "short", sl: 102, tp: 96 }));
    expect(r.status).toBe("win");
    expect(r.rr).toBeCloseTo(2, 10); // reward 4 / risk 2
  });

  it("no hit → open with unrealized R", () => {
    const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99.5, 101)];
    const r = evaluateTrade(bars, trade({}));
    expect(r.status).toBe("open");
    expect(r.rMultiple).toBeCloseTo(0.5, 10); // (101-100)/2
  });

  it("flags invalid geometry (SL on wrong side)", () => {
    const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99, 100)];
    const r = evaluateTrade(bars, trade({ sl: 102 }));
    expect(r.status).toBe("invalid");
  });
});

describe("tradeStats", () => {
  it("aggregates win rate, expectancy, totalR over closed trades", () => {
    const results = [
      { status: "win" as const, rr: 2, rMultiple: 2, exitBarIndex: 1, exitPrice: 1 },
      { status: "loss" as const, rr: 2, rMultiple: -1, exitBarIndex: 1, exitPrice: 1 },
      { status: "open" as const, rr: 2, rMultiple: 0.3, exitBarIndex: null, exitPrice: null },
    ];
    const s = tradeStats(results);
    expect(s.total).toBe(3);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.open).toBe(1);
    expect(s.winRate).toBeCloseTo(0.5, 10);
    expect(s.totalR).toBeCloseTo(1, 10);
    expect(s.expectancy).toBeCloseTo(0.5, 10);
  });
});

describe("defaultLevels", () => {
  it("long: SL below, TP above at RR", () => {
    const { sl, tp } = defaultLevels("long", 100, 1, 2);
    expect(sl).toBeCloseTo(99, 10);
    expect(tp).toBeCloseTo(102, 10);
  });
  it("short: SL above, TP below at RR", () => {
    const { sl, tp } = defaultLevels("short", 100, 1, 2);
    expect(sl).toBeCloseTo(101, 10);
    expect(tp).toBeCloseTo(98, 10);
  });
});

describe("decisionStats", () => {
  const bars: Bar[] = [];
  for (let i = 0; i < 30; i++) bars.push(bar(i, 100 + i, 100 + i + 1, 100 + i - 1, 100 + i));
  const signals: Signal[] = [{ barIndex: 5, type: "buy", time: bars[5].time, price: bars[5].close }];

  it("computes a favorable win for an uptrend buy", () => {
    const s = decisionStats(bars, signals, { [bars[5].time]: { decision: "take" } }, 10);
    expect(s.takes).toBe(1);
    expect(s.evaluated).toBe(1);
    expect(s.winRate).toBe(1);
    expect(s.expectancy).toBeGreaterThan(0);
    expect(s.histogram.length).toBeGreaterThan(0);
  });

  it("counts skips and ignores them in outcomes", () => {
    const s = decisionStats(bars, signals, { [bars[5].time]: { decision: "skip" } }, 10);
    expect(s.skips).toBe(1);
    expect(s.evaluated).toBe(0);
  });
});
