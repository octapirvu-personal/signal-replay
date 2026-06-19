/**
 * Time parsing. Everything is normalized to UTC seconds.
 *
 * Handles, from the formats we target:
 *  - MT5:  date "2024.01.02" + separate time "13:30:00"
 *  - MT4:  date "2024.01.02" + separate time "13:30"
 *  - TradingView: single ISO column "2024-01-02T13:30:00Z" or "2024-01-02 13:30"
 *  - UNIX seconds or millis in a single column
 */

/** Parse a (date, time) pair into UTC seconds, or null if unparseable. */
export function parseDateTime(dateStr: unknown, timeStr: unknown): number | null {
  let ds = String(dateStr ?? "").trim();
  const ts = String(timeStr ?? "").trim();
  if (!ds) return null;

  // Bare numeric with no separate time → treat as UNIX epoch (s or ms).
  if (!ts && /^-?\d+(\.\d+)?$/.test(ds)) {
    let n = parseFloat(ds);
    if (!isFinite(n)) return null;
    if (n > 1e12) n /= 1000; // millis → seconds
    return Math.round(n);
  }

  // Normalize date separators (2024.01.02 or 2024/01/02 → 2024-01-02).
  // Only touch separators that sit between digits so ISO offsets survive.
  const d = ds.replace(/(\d)[./](\d)/g, "$1-$2");

  let combined: string;
  if (/[T ]\d/.test(d)) {
    // date column already carries a time component
    combined = d.replace(" ", "T");
  } else {
    combined = d + (ts ? "T" + ts : "T00:00:00");
  }

  // If no timezone marker, assume UTC (MT/TradingView exports are wall-clock UTC).
  if (!/[zZ]|[+\-]\d\d:?\d\d$/.test(combined)) combined += "Z";

  let t = Date.parse(combined);
  if (isNaN(t)) {
    // last resort: let the engine try the raw date string
    t = Date.parse(ds);
  }
  return isNaN(t) ? null : Math.round(t / 1000);
}

/** Format UTC seconds as "YYYY-MM-DD" or "YYYY-MM-DD HH:MM" (intraday). */
export function formatTime(utcSeconds: number): string {
  const d = new Date(utcSeconds * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const base = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  const intraday = d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds();
  return intraday ? `${base} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : base;
}
