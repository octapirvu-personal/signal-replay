import { describe, it, expect } from "vitest";
import { computeBands, bbReEntrySignals } from "../bbReentry";
import type { Bar } from "../../data/types";

const bars = (closes: number[]): Bar[] =>
  closes.map((c, i) => ({ time: i + 1, open: c, high: c, low: c, close: c }));

describe("computeBands (population stdev)", () => {
  it("matches hand-computed values for closes [1,2,3,4,5], length 3, mult 2", () => {
    const { basis, upper, lower } = computeBands([1, 2, 3, 4, 5], 3, 2);
    // warmup
    expect(basis[0]).toBeNaN();
    expect(basis[1]).toBeNaN();
    // i=2 window [1,2,3]: mean 2, popStdev sqrt(2/3)=0.81650
    expect(basis[2]).toBeCloseTo(2, 10);
    expect(upper[2]).toBeCloseTo(2 + 2 * Math.sqrt(2 / 3), 10);
    expect(lower[2]).toBeCloseTo(2 - 2 * Math.sqrt(2 / 3), 10);
    // i=4 window [3,4,5]: mean 4, same sd
    expect(basis[4]).toBeCloseTo(4, 10);
    expect(upper[4]).toBeCloseTo(4 + 2 * Math.sqrt(2 / 3), 10);
  });
});

describe("bbReEntrySignals — known fixtures", () => {
  it("fires exactly one BUY at the re-entry bar", () => {
    // closes dip below the lower band at index 3, re-enter (above lower, below basis) at index 4.
    const { signals } = bbReEntrySignals(bars([10, 10, 10, 2, 5]), 3, 1);
    expect(signals).toEqual([{ barIndex: 4, type: "buy", time: 5, price: 5 }]);
  });

  it("fires exactly one SELL at the re-entry bar", () => {
    const { signals } = bbReEntrySignals(bars([10, 10, 10, 18, 15]), 3, 1);
    expect(signals).toEqual([{ barIndex: 4, type: "sell", time: 5, price: 15 }]);
  });

  it("produces no signals on a flat series", () => {
    const { signals } = bbReEntrySignals(bars([5, 5, 5, 5, 5, 5, 5]), 3, 2);
    expect(signals).toEqual([]);
  });

  it("never emits a signal before i >= length", () => {
    const { signals } = bbReEntrySignals(bars([10, 1, 10, 1, 10, 1, 10]), 3, 1);
    expect(signals.every((s) => s.barIndex >= 3)).toBe(true);
  });
});
