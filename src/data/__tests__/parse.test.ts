import { describe, it, expect } from "vitest";
import { parseDateTime, formatTime } from "../time";
import { detectDelimiter, looksLikeHeader, synthHeaders, parseDelimited } from "../csv";
import { autoMap, detectFormat } from "../columns";
import { parseCsvText } from "../parse";

describe("time parsing", () => {
  it("combines MT5 date + time as UTC", () => {
    expect(parseDateTime("2024.01.02", "13:30:00")).toBe(Date.UTC(2024, 0, 2, 13, 30, 0) / 1000);
  });
  it("combines MT4 date + short time as UTC", () => {
    expect(parseDateTime("2024.01.02", "13:30")).toBe(Date.UTC(2024, 0, 2, 13, 30, 0) / 1000);
  });
  it("parses ISO combined datetime", () => {
    expect(parseDateTime("2024-01-02T13:30:00Z", "")).toBe(Date.UTC(2024, 0, 2, 13, 30, 0) / 1000);
  });
  it("parses a space-separated combined datetime as UTC", () => {
    expect(parseDateTime("2024-01-02 13:30", "")).toBe(Date.UTC(2024, 0, 2, 13, 30, 0) / 1000);
  });
  it("parses UNIX seconds and millis", () => {
    expect(parseDateTime("1704202200", "")).toBe(1704202200);
    expect(parseDateTime("1704202200000", "")).toBe(1704202200);
  });
  it("formats intraday and daily", () => {
    expect(formatTime(Date.UTC(2024, 0, 2, 13, 30, 0) / 1000)).toBe("2024-01-02 13:30");
    expect(formatTime(Date.UTC(2024, 0, 2, 0, 0, 0) / 1000)).toBe("2024-01-02");
  });
});

describe("delimiter + header detection", () => {
  it("detects tab, comma, semicolon", () => {
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a;b;c")).toBe(";");
  });
  it("identifies header vs data rows", () => {
    expect(looksLikeHeader(["Date", "Open", "Close"])).toBe(true);
    expect(looksLikeHeader(["2024.01.02", "1.1", "1.2"])).toBe(false);
  });
  it("synthesizes headers for a headerless MT4 row", () => {
    const h = synthHeaders(["2024.01.02", "13:30", "1.1", "1.2", "1.0", "1.15", "100"]);
    expect(h).toEqual(["date", "time", "open", "high", "low", "close", "volume"]);
  });
});

describe("format detection + auto map", () => {
  it("maps an MT5 tab export with <> headers", () => {
    const headers = ["<DATE>", "<TIME>", "<OPEN>", "<HIGH>", "<LOW>", "<CLOSE>", "<TICKVOL>", "<VOL>", "<SPREAD>"];
    const m = autoMap(headers, ["2024.01.02", "13:30:00", "1", "2", "0.5", "1.5", "10", "0", "1"]);
    expect(detectFormat(headers)).toBe("mt5");
    expect([m.date, m.time, m.open, m.high, m.low, m.close]).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("treats a lone TradingView ISO 'time' column as the date source", () => {
    const headers = ["time", "open", "high", "low", "close"];
    const m = autoMap(headers, ["2024-01-02T13:30:00Z", "1", "2", "0.5", "1.5"]);
    expect(m.date).toBe(0);
    expect(m.time).toBe(-1);
  });
});

describe("end-to-end parseCsvText", () => {
  const mt5 = [
    "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>",
    "2024.01.02\t13:30:00\t1.10\t1.12\t1.09\t1.11\t100\t0\t1",
    "2024.01.02\t13:31:00\t1.11\t1.13\t1.10\t1.12\t120\t0\t1",
    "2024.01.02\t13:32:00\t1.12\t1.14\t1.11\t1.13\t90\t0\t1",
    "2024.01.02\t13:33:00\t1.13\t1.15\t1.12\t1.14\t80\t0\t1",
    "2024.01.02\t13:34:00\t1.14\t1.16\t1.13\t1.15\t70\t0\t1",
  ].join("\n");

  it("parses an MT5 export into ascending unique bars", () => {
    const res = parseCsvText(mt5);
    expect(res.confident).toBe(true);
    expect(res.format).toBe("mt5");
    expect(res.bars).toHaveLength(5);
    expect(res.bars[0].close).toBeCloseTo(1.11, 10);
    // ascending + unique
    for (let i = 1; i < res.bars.length; i++) expect(res.bars[i].time).toBeGreaterThan(res.bars[i - 1].time);
  });

  it("de-duplicates identical timestamps keeping the last", () => {
    const dup = mt5 + "\n2024.01.02\t13:34:00\t9.9\t9.9\t9.9\t9.99\t1\t0\t1";
    const res = parseCsvText(dup);
    expect(res.bars).toHaveLength(5);
    expect(res.bars[res.bars.length - 1].close).toBeCloseTo(9.99, 10);
  });

  it("reads buy/sell signal columns when present", () => {
    const withSig = [
      "date,time,open,high,low,close,buy,sell",
      "2024.01.02,13:30,1,2,0.5,1.5,,",
      "2024.01.02,13:31,1,2,0.5,1.5,1,",
      "2024.01.02,13:32,1,2,0.5,1.5,,",
      "2024.01.02,13:33,1,2,0.5,1.5,,1",
      "2024.01.02,13:34,1,2,0.5,1.5,,",
    ].join("\n");
    const res = parseCsvText(withSig);
    expect(res.hasCsvSignals).toBe(true);
    expect(res.csvFlags?.[1].buy).toBe(true);
    expect(res.csvFlags?.[3].sell).toBe(true);
  });
});

describe("low-level parseDelimited", () => {
  it("handles quoted fields with embedded delimiters", () => {
    const rows = parseDelimited('a,"b,c",d\n1,2,3', ",");
    expect(rows[0]).toEqual(["a", "b,c", "d"]);
    expect(rows[1]).toEqual(["1", "2", "3"]);
  });
});
