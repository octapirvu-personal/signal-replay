import type { Bar } from "../data/types";

export type SignalType = "buy" | "sell";

export interface Signal {
  barIndex: number;
  type: SignalType;
  time: number;
  price: number;
}

/** Bollinger-style bands aligned index-for-index with the bar array (NaN before warmup). */
export interface Bands {
  basis: number[];
  upper: number[];
  lower: number[];
}

export interface StrategyParam {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface StrategyOutput {
  signals: Signal[];
  /** Optional indicator bands to draw on the chart. */
  bands?: Bands;
}

export interface Strategy {
  id: string;
  name: string;
  params: StrategyParam[];
  compute(bars: Bar[], params: Record<string, number>): StrategyOutput;
}
