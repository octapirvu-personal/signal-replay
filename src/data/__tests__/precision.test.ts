import { describe, it, expect } from "vitest";
import { detectPricePrecision, minMoveFor } from "../precision";
import type { Bar } from "../types";

const bar = (o: number, h: number, l: number, c: number): Bar => ({
  time: 0,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: 0,
});

describe("detectPricePrecision", () => {
  it("floors at 2 for low-precision (stock-like) data", () => {
    expect(detectPricePrecision([bar(100, 101, 99, 100.5)])).toBe(2);
    expect(detectPricePrecision([bar(4500, 4510, 4490, 4505.25)])).toBe(2);
  });

  it("detects 5 decimals for forex-like data", () => {
    expect(detectPricePrecision([bar(1.10523, 1.10677, 1.1041, 1.10599)])).toBe(5);
  });

  it("caps at 5 even when more decimals are present", () => {
    expect(detectPricePrecision([bar(1.123456789, 1.2, 1.0, 1.1)])).toBe(5);
  });

  it("uses the max precision found across all bars", () => {
    const bars = [bar(1.1, 1.2, 1.0, 1.1), bar(1.105, 1.2, 1.0, 1.1), bar(1.10523, 1.2, 1.0, 1.1)];
    expect(detectPricePrecision(bars)).toBe(5);
  });

  it("returns the min for an empty dataset", () => {
    expect(detectPricePrecision([])).toBe(2);
  });

  it("minMoveFor matches the precision", () => {
    expect(minMoveFor(2)).toBeCloseTo(0.01, 10);
    expect(minMoveFor(5)).toBeCloseTo(0.00001, 10);
  });
});
