import { useMemo, useState } from "react";
import { useApp } from "../state/app";
import { useDrawings } from "../state/drawings";
import { formatTime } from "../data/time";
import { compareSignals } from "../signals";
import { gotoSignal, setNote, setRating } from "../app/controls";
import { evaluateTrade } from "../backtest/trades";
import { StatsPanel } from "./StatsPanel";
import { IndicatorsMenu } from "./IndicatorsMenu";

const RATINGS = ["A", "B", "C"];

export function Sidebar({ onHide }: { onHide: () => void }) {
  const { signals, cur, decisions, hasCsvSignals, computed, fileSigs, bars } = useApp();
  const trades = useDrawings((s) => s.trades);
  const select = useDrawings((s) => s.select);
  const removeTrade = useDrawings((s) => s.removeTrade);
  const selection = useDrawings((s) => s.selection);
  const [tab, setTab] = useState<"signals" | "trades">("signals");
  const sg = signals[cur];

  const compare = useMemo(() => {
    if (!hasCsvSignals || !computed.length) return null;
    return compareSignals(computed, fileSigs);
  }, [hasCsvSignals, computed, fileSigs]);

  const dec = sg ? decisions[sg.time] : undefined;

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-[86vw] max-w-[330px] flex-col border-l border-line bg-panel shadow-2xl md:static md:z-auto md:w-[300px] md:shadow-none">
      <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1">
        <IndicatorsMenu />
        <button className="text-muted hover:text-ink" title="Hide sidebar" onClick={onHide}>
          ›
        </button>
      </div>

      {compare && (
        <div className={`border-b border-line px-3 py-2 text-xs ${compare.exact ? "text-buy" : "text-sell"}`}>
          file vs computed: {compare.match} match · file {compare.bSize} / computed {compare.aSize}
          {compare.exact ? " ✓ exact" : " ⚠ differs"}
        </div>
      )}

      {/* current-signal journaling */}
      <div className="border-b border-line p-3">
        <div className="mb-2 stat-k">Notes & rating</div>
        <div className="mb-2 flex gap-1.5">
          {RATINGS.map((r) => (
            <button
              key={r}
              disabled={!dec}
              className={`btn flex-1 ${dec?.rating === r ? "btn-active" : ""}`}
              onClick={() => setRating(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          className="h-16 w-full resize-none rounded-md border border-line bg-bg p-2 text-[13px] text-ink placeholder:text-muted disabled:opacity-50"
          placeholder={dec ? "Note for this signal…" : "Decide Take/Skip to annotate"}
          disabled={!dec}
          value={dec?.note ?? ""}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* tabs */}
      <div className="flex border-b border-line text-[12px]">
        <button
          className={`flex-1 py-2 ${tab === "signals" ? "border-b-2 border-accent text-ink" : "text-muted"}`}
          onClick={() => setTab("signals")}
        >
          Signals ({signals.length})
        </button>
        <button
          className={`flex-1 py-2 ${tab === "trades" ? "border-b-2 border-accent text-ink" : "text-muted"}`}
          onClick={() => setTab("trades")}
        >
          Trades ({trades.length})
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "signals"
          ? signals.map((s, i) => {
              const d = decisions[s.time];
              return (
                <button
                  key={`${s.barIndex}-${s.type}`}
                  onClick={() => gotoSignal(i)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-panel2 ${i === cur ? "bg-panel2" : ""}`}
                >
                  <span className="w-7 text-muted">{i + 1}</span>
                  <span className={`w-9 font-semibold ${s.type === "buy" ? "text-buy" : "text-sell"}`}>
                    {s.type === "buy" ? "BUY" : "SELL"}
                  </span>
                  <span className="flex-1 text-muted">{formatTime(s.time)}</span>
                  {d && <span className={d.decision === "take" ? "text-buy" : "text-sell"}>{d.decision === "take" ? "✓" : "✗"}</span>}
                </button>
              );
            })
          : trades.length === 0
            ? <div className="px-3 py-3 text-[12.5px] text-muted">No trades yet. Use ⚡ (trade from signal) or the ▲/▼ tools, then drag SL/TP.</div>
            : trades.map((t) => {
                const r = evaluateTrade(bars, t);
                const sel = selection?.kind === "trade" && selection.id === t.id;
                const rTxt =
                  r.status === "win" ? `+${r.rMultiple.toFixed(1)}R` : r.status === "loss" ? "−1R" : r.status === "open" ? `${r.rMultiple >= 0 ? "+" : ""}${r.rMultiple.toFixed(1)}R*` : "—";
                const rColor = r.status === "win" ? "text-buy" : r.status === "loss" ? "text-sell" : "text-muted";
                return (
                  <div
                    key={t.id}
                    onClick={() => select({ kind: "trade", id: t.id })}
                    className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-panel2 ${sel ? "bg-panel2" : ""}`}
                  >
                    <span className={`w-10 font-semibold ${t.direction === "long" ? "text-buy" : "text-sell"}`}>
                      {t.direction === "long" ? "LONG" : "SHORT"}
                    </span>
                    <span className="flex-1 text-muted">{formatTime(t.entryTime)}</span>
                    <span className={rColor}>{rTxt}</span>
                    <button
                      title="Delete trade"
                      className="text-muted hover:text-sell"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTrade(t.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
      </div>

      <StatsPanel />
    </aside>
  );
}
