import { formatTime } from "../data/time";
import type { Signal } from "../signals/types";
import type { DecisionRecord } from "../state/app";

/** Build a results CSV: every signal with type, datetime, price, decision, note, rating. */
export function buildResultsCsv(signals: Signal[], decisions: Record<number, DecisionRecord>): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ["signal_no,type,datetime_utc,price,decision,rating,note"];
  signals.forEach((s, i) => {
    const d = decisions[s.time];
    lines.push(
      [
        String(i + 1),
        s.type,
        formatTime(s.time),
        String(s.price),
        d?.decision ?? "",
        d?.rating ?? "",
        esc(d?.note ?? ""),
      ].join(","),
    );
  });
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export interface Stats {
  decided: number;
  takes: number;
  skips: number;
}

export function tally(decisions: Record<number, DecisionRecord>): Stats {
  const vals = Object.values(decisions);
  return {
    decided: vals.length,
    takes: vals.filter((v) => v.decision === "take").length,
    skips: vals.filter((v) => v.decision === "skip").length,
  };
}
