import { describe, it, expect } from "vitest";
import { hammerSignals, type HammerParams } from "../hammer";
import type { Bar } from "../../data/types";

const P: HammerParams = { bodyMax: 35, hLowerMin: 55, hUpperWiggle: 5, ihUpperMin: 55, ihLowerWiggle: 5 };
const bar = (o: number, h: number, l: number, c: number, i = 0): Bar => ({ time: i + 1, open: o, high: h, low: l, close: c });

describe("hammerSignals", () => {
  it("detects a bullish hammer as a buy", () => {
    // long lower wick, tiny upper wick, small body, close >= open
    const { signals } = hammerSignals([bar(100, 101.2, 94, 101)], P);
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("buy");
  });

  it("detects a bearish inverted hammer as a sell", () => {
    // long upper wick, tiny lower wick, small body, close < open
    const { signals } = hammerSignals([bar(100, 106, 98.8, 99)], P);
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("sell");
  });

  it("ignores a large-body candle", () => {
    const { signals } = hammerSignals([bar(100, 106.1, 99.9, 106)], P);
    expect(signals).toHaveLength(0);
  });

  it("ignores a zero-range candle", () => {
    const { signals } = hammerSignals([bar(100, 100, 100, 100)], P);
    expect(signals).toHaveLength(0);
  });
});
