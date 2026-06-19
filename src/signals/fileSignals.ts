import type { Bar, SignalFlags } from "../data/types";
import type { Signal } from "./types";

/** Build signals from a CSV's per-bar buy/sell flags. */
export function fileSignals(bars: Bar[], flags: SignalFlags[] | null): Signal[] {
  if (!flags) return [];
  const out: Signal[] = [];
  flags.forEach((f, i) => {
    if (i >= bars.length) return;
    if (f.buy) out.push({ barIndex: i, type: "buy", time: bars[i].time, price: bars[i].close });
    if (f.sell) out.push({ barIndex: i, type: "sell", time: bars[i].time, price: bars[i].close });
  });
  return out;
}

/** Compare two signal sets (used for the file-vs-computed validation readout). */
export function compareSignals(
  a: Signal[],
  b: Signal[],
): { match: number; aSize: number; bSize: number; exact: boolean } {
  const key = (s: Signal) => s.barIndex + ":" + s.type;
  const setA = new Set(a.map(key));
  const setB = new Set(b.map(key));
  let match = 0;
  setA.forEach((k) => {
    if (setB.has(k)) match++;
  });
  const exact = match === setA.size && setA.size === setB.size;
  return { match, aSize: setA.size, bSize: setB.size, exact };
}
