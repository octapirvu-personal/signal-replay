import { useEffect, useMemo, useState } from "react";
import { useApp } from "../state/app";
import { useSettings } from "../state/settings";
import { useDrawings } from "../state/drawings";
import { formatTime } from "../data/time";
import { gotoTrade } from "../app/controls";
import { buildJournal, journalSummary, formatDuration, type JournalEntry } from "../backtest/journal";

type OutcomeFilter = "all" | "win" | "loss" | "open";
type DirFilter = "all" | "long" | "short";

export function JournalDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const bars = useApp((s) => s.bars);
  const datasetName = useApp((s) => s.datasetName);
  const precision = useApp((s) => s.pricePrecision);
  const frontier = useApp((s) => s.frontier);
  const trades = useDrawings((s) => s.trades);
  const selection = useDrawings((s) => s.selection);
  const removeTrade = useDrawings((s) => s.removeTrade);
  const positionSize = useSettings((s) => s.positionSize);
  const pipValue = useSettings((s) => s.pipValue);
  const setSetting = useSettings((s) => s.set);

  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [dir, setDir] = useState<DirFilter>("all");
  const [symbol, setSymbol] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // close on Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const entries = useMemo(
    () =>
      buildJournal(bars, trades, {
        fallbackSymbol: datasetName || "—",
        defaultSize: positionSize,
        defaultPipValue: pipValue,
        precision,
      }),
    [bars, trades, datasetName, positionSize, pipValue, precision],
  );

  // only PAST trades — never reveal trades placed ahead of the current replay
  // position (e.g. ones you placed before rewinding the chart).
  const past = useMemo(() => entries.filter((e) => e.entryBarIndex <= frontier), [entries, frontier]);
  const symbols = useMemo(() => Array.from(new Set(past.map((e) => e.symbol))), [past]);

  const filtered = useMemo(() => {
    const fromSec = from ? Date.parse(from + "T00:00:00Z") / 1000 : -Infinity;
    const toSec = to ? Date.parse(to + "T23:59:59Z") / 1000 : Infinity;
    return past
      .filter((e) => (outcome === "all" ? true : e.status === outcome))
      .filter((e) => (dir === "all" ? true : e.direction === dir))
      .filter((e) => (symbol === "all" ? true : e.symbol === symbol))
      .filter((e) => e.entryTime >= fromSec && e.entryTime <= toSec)
      .sort((a, b) => b.entryTime - a.entryTime);
  }, [past, outcome, dir, symbol, from, to]);

  const summary = useMemo(() => journalSummary(filtered), [filtered]);
  const money = (v: number) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <>
      {/* click-away backdrop (left of the drawer) */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[820px] max-w-[94vw] flex-col border-l border-line bg-panel shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* header */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="m-0 text-[15px] font-semibold">Trade Journal</h2>
          <span className="text-xs text-muted">{past.length} trades</span>
          <div className="flex-1" />
          <label className="fld">
            Size
            <input
              type="number"
              className="num !w-16"
              min={0}
              step="any"
              value={positionSize}
              onChange={(e) => setSetting("positionSize", Math.max(0, Number(e.target.value)))}
            />
          </label>
          <label className="fld">
            $/pip
            <input
              type="number"
              className="num !w-16"
              min={0}
              step="any"
              value={pipValue}
              onChange={(e) => setSetting("pipValue", Math.max(0, Number(e.target.value)))}
            />
          </label>
          <button className="btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        {/* summary */}
        <div className="grid grid-cols-5 gap-2 border-b border-line px-4 py-3">
          <Stat label="Win rate" value={`${(summary.winRate * 100).toFixed(0)}%`} sub={`${summary.wins}W / ${summary.losses}L`} good={summary.winRate >= 0.5} />
          <Stat label="Total P&L" value={money(summary.totalPnl)} sub={`${summary.totalResultPips >= 0 ? "+" : "−"}${Math.abs(summary.totalResultPips).toFixed(0)} pips`} good={summary.totalPnl >= 0} />
          <Stat label="Avg R:R" value={summary.avgRR.toFixed(2)} sub={`${summary.open} open`} />
          <Stat label="Largest win" value={money(summary.largestWin)} good />
          <Stat label="Largest loss" value={money(summary.largestLoss)} good={false} />
        </div>

        {/* filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-xs">
          <Seg label="Outcome" value={outcome} setValue={setOutcome} opts={[["all", "All"], ["win", "Win"], ["loss", "Loss"], ["open", "Open"]]} />
          <Seg label="Side" value={dir} setValue={setDir} opts={[["all", "All"], ["long", "Long"], ["short", "Short"]]} />
          <label className="fld">
            Symbol
            <select className="sel" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              <option value="all">all</option>
              {symbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="fld">
            From
            <input type="date" className="sel" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="fld">
            To
            <input type="date" className="sel" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {(outcome !== "all" || dir !== "all" || symbol !== "all" || from || to) && (
            <button
              className="btn !py-1"
              onClick={() => {
                setOutcome("all");
                setDir("all");
                setSymbol("all");
                setFrom("");
                setTo("");
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* table */}
        <div className="min-h-0 flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-muted">
              {past.length === 0
                ? "No trades up to the current candle yet. Press 3 (long) / 4 (short) to plot a trade — it auto-journals here."
                : "No trades match the current filters."}
            </div>
          ) : (
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="sticky top-0 bg-panel2 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <Th>Date</Th>
                  <Th>Symbol</Th>
                  <Th>Side</Th>
                  <Th right>Entry</Th>
                  <Th right>TP</Th>
                  <Th right>SL</Th>
                  <Th right>R:R</Th>
                  <Th>Outcome</Th>
                  <Th right>P&L</Th>
                  <Th right>Duration</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <Row key={e.id} e={e} precision={precision} money={money} selected={selection?.kind === "trade" && selection.id === e.id} onRemove={() => removeTrade(e.id)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </>
  );
}

function Row({
  e,
  precision,
  money,
  selected,
  onRemove,
}: {
  e: JournalEntry;
  precision: number;
  money: (v: number) => string;
  selected: boolean;
  onRemove: () => void;
}) {
  const sideColor = e.direction === "long" ? "text-buy" : "text-sell";
  const outcomeBadge =
    e.status === "win"
      ? { txt: "WIN", cls: "bg-buy/20 text-buy" }
      : e.status === "loss"
        ? { txt: "LOSS", cls: "bg-sell/20 text-sell" }
        : e.status === "open"
          ? { txt: "OPEN", cls: "bg-panel2 text-muted" }
          : { txt: "INVALID", cls: "bg-panel2 text-muted" };
  const pnlColor = e.status === "open" ? "text-muted" : e.pnl >= 0 ? "text-buy" : "text-sell";

  return (
    <tr
      onClick={() => gotoTrade(e.id)}
      className={`cursor-pointer border-b border-line/60 hover:bg-panel2 ${selected ? "bg-panel2" : ""}`}
      title="Jump to this trade on the chart"
    >
      <Td>{formatTime(e.entryTime)}</Td>
      <Td>{e.symbol}</Td>
      <Td className={`font-semibold ${sideColor}`}>{e.direction === "long" ? "LONG" : "SHORT"}</Td>
      <Td right>{e.entryPrice.toFixed(precision)}</Td>
      <Td right className="text-buy">{e.tp.toFixed(precision)}</Td>
      <Td right className="text-sell">{e.sl.toFixed(precision)}</Td>
      <Td right>{e.rr.toFixed(2)}</Td>
      <Td>
        <span className={`pill !px-2 !py-0.5 !text-[10.5px] ${outcomeBadge.cls}`}>{outcomeBadge.txt}</span>
      </Td>
      <Td right className={pnlColor}>
        <div>{e.status === "open" ? "—" : money(e.pnl)}</div>
        <div className="text-[10.5px] text-muted">
          {e.resultPips >= 0 ? "+" : "−"}
          {Math.abs(e.resultPips).toFixed(0)}p · {e.rMultiple >= 0 ? "+" : ""}
          {e.rMultiple.toFixed(1)}R
        </div>
      </Td>
      <Td right>{formatDuration(e.durationSec)}</Td>
      <Td>
        <button
          className="text-muted hover:text-sell"
          title="Delete trade"
          onClick={(ev) => {
            ev.stopPropagation();
            onRemove();
          }}
        >
          ✕
        </button>
      </Td>
    </tr>
  );
}

function Stat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  const color = good === undefined ? "text-ink" : good ? "text-buy" : "text-sell";
  return (
    <div className="rounded-md border border-line bg-bg px-2.5 py-1.5">
      <div className="stat-k">{label}</div>
      <div className={`text-[15px] font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-muted">{sub}</div>}
    </div>
  );
}

function Seg<T extends string>({ label, value, setValue, opts }: { label: string; value: T; setValue: (v: T) => void; opts: [T, string][] }) {
  return (
    <div className="fld">
      {label}
      <div className="flex overflow-hidden rounded-md border border-line">
        {opts.map(([v, txt]) => (
          <button
            key={v}
            className={`px-2 py-1 ${value === v ? "bg-accent text-white" : "bg-panel2 text-muted hover:text-ink"}`}
            onClick={() => setValue(v)}
          >
            {txt}
          </button>
        ))}
      </div>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, right, className = "" }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-3 py-1.5 ${right ? "text-right" : "text-left"} ${className}`}>{children}</td>;
}
