import type { Trade } from "../backtest/trades";

export type DrawTool = "cursor" | "trendline" | "long" | "short";

export type LineStyleName = "solid" | "dashed" | "dotted";

/** A point anchored in (time, price) space so it stays glued through zoom/pan/replay. */
export interface Anchor {
  time: number;
  price: number;
}

export type ExtendDir = "none" | "right" | "both";

export interface Trendline {
  id: string;
  type: "trendline";
  a: Anchor;
  b: Anchor;
  color: string;
  width: number;
  style: LineStyleName;
  /** Project the line beyond its anchors using the slope (TradingView "extend"). */
  extend: ExtendDir;
}

/** A selection handle reference. */
export type Selection =
  | { kind: "trendline"; id: string }
  | { kind: "trade"; id: string }
  | null;

/** Everything persisted per dataset. */
export interface DrawingsSnapshot {
  trendlines: Trendline[];
  trades: Trade[];
}

export const DEFAULT_LINE_COLOR = "#f0b429";
export const LONG_COLOR = "#26a69a";
export const SHORT_COLOR = "#ef5350";
