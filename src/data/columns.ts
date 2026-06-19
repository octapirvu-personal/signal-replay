import type { ColumnMap, CsvFormat } from "./types";
import { EMPTY_MAP } from "./types";

/** Normalize a header: strip MT-style angle brackets, trim, lowercase. */
export function norm(h: string): string {
  return h.replace(/[<>]/g, "").trim().toLowerCase();
}

/** Find the first header matching any candidate (exact, then substring). */
export function guess(headers: string[], candidates: string[]): number {
  const l = headers.map(norm);
  for (const c of candidates) {
    const i = l.indexOf(c);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const i = l.findIndex((h) => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

/** Resolve which columns hold date vs time, handling combined datetime columns. */
export function resolveTime(headers: string[], sample?: string[]): { dateCol: number; timeCol: number } {
  const l = headers.map(norm);
  let dateCol = l.indexOf("date");
  let timeCol = l.indexOf("time");
  if (dateCol < 0)
    dateCol = l.findIndex((h) => h.includes("date") || h.includes("datetime") || h.includes("timestamp"));
  if (timeCol < 0) timeCol = l.findIndex((h) => h === "time");
  // a lone "time" column (TradingView ISO/unix) is the date source
  if (dateCol < 0 && timeCol >= 0) {
    dateCol = timeCol;
    timeCol = -1;
  }
  if (timeCol === dateCol) timeCol = -1;
  // if the date cell already carries a time component, ignore a separate time col
  if (dateCol >= 0 && sample) {
    const dv = sample[dateCol] || "";
    if (/[T ]\d{1,2}:\d{2}/.test(dv)) timeCol = -1;
  }
  return { dateCol, timeCol };
}

/** Auto-map columns from headers + a sample row. */
export function autoMap(headers: string[], sample?: string[]): ColumnMap {
  const { dateCol, timeCol } = resolveTime(headers, sample);
  return {
    ...EMPTY_MAP,
    date: dateCol,
    time: timeCol,
    open: guess(headers, ["open"]),
    high: guess(headers, ["high"]),
    low: guess(headers, ["low"]),
    close: guess(headers, ["close", "price"]),
    volume: guess(headers, ["tickvol", "volume", "vol"]),
    buy: guess(headers, ["buysignal", "buy_signal", "buy"]),
    sell: guess(headers, ["sellsignal", "sell_signal", "sell"]),
  };
}

/** Best-effort format label for display / debugging. */
export function detectFormat(headers: string[]): CsvFormat {
  const l = headers.map(norm);
  const hasAngle = headers.some((h) => h.includes("<") && h.includes(">"));
  if (hasAngle || (l.includes("tickvol") && l.includes("spread"))) return "mt5";
  if (l.includes("time") && !l.includes("date") && (l.includes("open") || l.includes("close")))
    return "tradingview";
  if (l.every((h) => /^col\d+$/.test(h) || ["date", "time", "open", "high", "low", "close", "volume"].includes(h)))
    return "mt4";
  return "generic";
}

/** True when the core columns are all mapped (date + OHLC). */
export function isMapComplete(map: ColumnMap): boolean {
  return [map.date, map.open, map.high, map.low, map.close].every((x) => x >= 0);
}
