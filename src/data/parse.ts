import type { Bar, ColumnMap, ParseResult, RawCsv, SignalFlags } from "./types";
import { toRawCsv } from "./csv";
import { autoMap, detectFormat, isMapComplete } from "./columns";
import { parseDateTime } from "./time";

/** Truthy-signal test: non-empty, non-zero, non-NaN, non-falsey cell. */
export function isSignalCell(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return !(s === "" || s === "nan" || s === "na" || s === "null" || s === "0" || s === "false");
}

/**
 * Build bars (and optional per-bar signal flags) from raw CSV rows under a column map.
 * Sorts ascending by time and de-duplicates identical timestamps (keep last).
 */
export function buildBars(
  raw: RawCsv,
  map: ColumnMap,
): { bars: Bar[]; csvFlags: SignalFlags[] | null; hasCsvSignals: boolean } {
  if (!isMapComplete(map)) {
    throw new Error("Date and all OHLC columns must be mapped.");
  }
  const hasCsvSignals = map.buy >= 0 || map.sell >= 0;

  interface Tmp extends Bar {
    _buy: boolean;
    _sell: boolean;
  }
  const tmp: Tmp[] = [];

  for (const r of raw.rows) {
    const t = parseDateTime(r[map.date], map.time >= 0 ? r[map.time] : "");
    const open = parseFloat(r[map.open]);
    const high = parseFloat(r[map.high]);
    const low = parseFloat(r[map.low]);
    const close = parseFloat(r[map.close]);
    if (t == null || [open, high, low, close].some(Number.isNaN)) continue;
    const volume = map.volume >= 0 ? parseFloat(r[map.volume]) : undefined;
    tmp.push({
      time: t,
      open,
      high,
      low,
      close,
      volume: Number.isNaN(volume as number) ? undefined : volume,
      _buy: map.buy >= 0 ? isSignalCell(r[map.buy]) : false,
      _sell: map.sell >= 0 ? isSignalCell(r[map.sell]) : false,
    });
  }

  if (tmp.length < 5) {
    throw new Error(`Parsed only ${tmp.length} rows — check the column mapping.`);
  }

  tmp.sort((a, b) => a.time - b.time);
  // de-dup identical timestamps, keep last
  const dd: Tmp[] = [];
  for (const row of tmp) {
    if (dd.length && dd[dd.length - 1].time === row.time) dd[dd.length - 1] = row;
    else dd.push(row);
  }

  const bars: Bar[] = dd.map(({ time, open, high, low, close, volume }) => ({
    time,
    open,
    high,
    low,
    close,
    ...(volume === undefined ? {} : { volume }),
  }));

  const csvFlags = hasCsvSignals ? dd.map((r) => ({ buy: r._buy, sell: r._sell })) : null;
  return { bars, csvFlags, hasCsvSignals };
}

/**
 * Full pipeline: raw text → bars. Returns a confidence flag so the UI knows
 * whether to surface the column-mapping bar for correction.
 */
export function parseCsvText(text: string): ParseResult {
  const raw = toRawCsv(text);
  const map = autoMap(raw.headers, raw.rows[0]);
  const format = detectFormat(raw.headers);
  const confident = isMapComplete(map);

  if (!confident) {
    // can't build yet — let caller show the mapping bar
    return {
      bars: [],
      csvFlags: null,
      hasCsvSignals: map.buy >= 0 || map.sell >= 0,
      format,
      map,
      headers: raw.headers,
      confident: false,
    };
  }

  const { bars, csvFlags, hasCsvSignals } = buildBars(raw, map);
  return { bars, csvFlags, hasCsvSignals, format, map, headers: raw.headers, confident: true };
}
