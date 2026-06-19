/** A single OHLC bar. `time` is UTC seconds (lightweight-charts UTCTimestamp). */
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** Per-bar buy/sell flags read straight from a CSV's signal columns. */
export interface SignalFlags {
  buy: boolean;
  sell: boolean;
}

/** Column indices into a parsed CSV row. `-1` means "not mapped". */
export interface ColumnMap {
  date: number;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buy: number;
  sell: number;
}

/** Raw CSV after splitting: a header list and the data rows. */
export interface RawCsv {
  headers: string[];
  rows: string[][];
}

export type CsvFormat = "mt5" | "mt4" | "tradingview" | "generic";

/** Output of a full parse: candles, optional per-bar CSV signal flags, and metadata. */
export interface ParseResult {
  bars: Bar[];
  /** Present only when the CSV had buy/sell columns. */
  csvFlags: SignalFlags[] | null;
  hasCsvSignals: boolean;
  format: CsvFormat;
  map: ColumnMap;
  headers: string[];
  /** True when auto-detection was confident; false → surface the mapping bar. */
  confident: boolean;
}

export const EMPTY_MAP: ColumnMap = {
  date: -1,
  time: -1,
  open: -1,
  high: -1,
  low: -1,
  close: -1,
  volume: -1,
  buy: -1,
  sell: -1,
};
