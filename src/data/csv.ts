import type { RawCsv } from "./types";

/** Pick the most frequent of comma / tab / semicolon on a representative line. */
export function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { ",": 0, "\t": 0, ";": 0 };
  for (const ch of line) if (ch in counts) counts[ch]++;
  let best = ",";
  let n = -1;
  for (const d of Object.keys(counts)) {
    if (counts[d] > n) {
      n = counts[d];
      best = d;
    }
  }
  return best;
}

/** Minimal RFC-4180-ish CSV/TSV parser with quote handling. */
export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delim) {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch === "\r") {
        // ignore — handled with \n
      } else {
        field += ch;
      }
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  // drop trailing blank rows
  while (rows.length && rows[rows.length - 1].every((x) => x.trim() === "")) rows.pop();
  return rows;
}

/** A row is a header if at least half its cells contain alphabetic characters. */
export function looksLikeHeader(row: string[]): boolean {
  let alpha = 0;
  for (const c of row) if (/[a-zA-Z]/.test(c)) alpha++;
  return alpha >= Math.max(1, Math.ceil(row.length / 2));
}

/** Synthesize column names for a headerless row by locating date/time/OHLC. */
export function synthHeaders(row: string[]): string[] {
  const dateIdx = row.findIndex((c) => /^\s*\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/.test(c));
  const timeIdx = row.findIndex((c, i) => i !== dateIdx && /^\s*\d{1,2}:\d{2}/.test(c));
  const start = Math.max(dateIdx, timeIdx) + 1;
  const h = row.map((_, i) => "col" + i);
  if (dateIdx >= 0) h[dateIdx] = "date";
  if (timeIdx >= 0) h[timeIdx] = "time";
  ["open", "high", "low", "close", "volume"].forEach((nm, k) => {
    if (start + k < h.length) h[start + k] = nm;
  });
  return h;
}

/** Split raw text into headers + data rows, synthesizing headers when needed. */
export function toRawCsv(text: string): RawCsv {
  const firstLine = text.split("\n").find((l) => l.trim()) || "";
  const delim = detectDelimiter(firstLine);
  const rows = parseDelimited(text, delim);
  if (!rows.length) throw new Error("Empty file.");
  if (looksLikeHeader(rows[0])) {
    return { headers: rows[0].map((h) => h.trim()), rows: rows.slice(1) };
  }
  return { headers: synthHeaders(rows[0]), rows };
}
