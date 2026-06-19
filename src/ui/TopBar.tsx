import { useRef } from "react";
import { useApp } from "../state/app";
import { useSettings } from "../state/settings";
import { getStrategy } from "../signals";
import { recomputeSignals } from "../app/dataset";
import { readFileAndLoad } from "../app/fileLoad";
import { setLookback } from "../app/controls";
import { buildResultsCsv, downloadCsv } from "../backtest/results";
import { useAuth } from "../state/auth";
import { DatasetSwitcher } from "./DatasetSwitcher";

export function TopBar({ onShowShortcuts, onOpenJournal }: { onShowShortcuts: () => void; onOpenJournal: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const s = useSettings();
  const hasDataset = useApp((st) => st.datasetId != null);
  const hasCsvSignals = useApp((st) => st.hasCsvSignals);
  const signals = useApp((st) => st.signals);
  const decisions = useApp((st) => st.decisions);
  const strategy = getStrategy(s.strategyId);

  function changeParam(key: string, value: number) {
    s.setParam(key, value);
    recomputeSignals(true);
  }

  return (
    <header className="flex items-center gap-3 overflow-x-auto border-b border-line bg-panel px-4 py-2 md:flex-wrap md:overflow-x-visible">
      <h1 className="m-0 text-[15px] font-semibold">
        Signal Replay <span className="text-xs font-normal text-muted">· blind backtester</span>
      </h1>

      <DatasetSwitcher />

      <div className="flex-1" />

      <label className="fld">
        Signals
        <select
          className="sel"
          value={s.sigSource}
          onChange={(e) => {
            s.set("sigSource", e.target.value as typeof s.sigSource);
            recomputeSignals(true);
          }}
        >
          <option value="auto">auto</option>
          <option value="file" disabled={!hasCsvSignals}>
            from file
          </option>
          <option value="compute">computed</option>
        </select>
      </label>

      {strategy.params.map((p) => (
        <label className="fld" key={p.key}>
          {p.label}
          <input
            type="number"
            className="num"
            value={s.strategyParams[p.key] ?? p.default}
            min={p.min}
            max={p.max}
            step={p.step}
            onChange={(e) => changeParam(p.key, Number(e.target.value))}
          />
        </label>
      ))}

      <label className="fld">
        Lookback
        <input
          type="number"
          className="num"
          value={s.lookback}
          min={20}
          max={3000}
          onChange={(e) => setLookback(Number(e.target.value))}
        />
      </label>

      <label className="fld">
        Reveal
        <input
          type="number"
          className="num"
          value={s.revealStep}
          min={1}
          max={500}
          onChange={(e) => s.set("revealStep", Math.max(1, Number(e.target.value)))}
        />
      </label>

      <button
        className={`btn ${s.followFrontier ? "btn-active" : ""}`}
        title="Auto-scroll to keep the frontier in view"
        onClick={() => s.set("followFrontier", !s.followFrontier)}
      >
        Follow
      </button>
      <button
        className={`btn ${s.showBands ? "btn-active" : ""}`}
        onClick={() => s.set("showBands", !s.showBands)}
      >
        Bands
      </button>
      <button
        className={`btn ${s.animate ? "btn-active" : ""}`}
        title="Smooth streaming reveal"
        onClick={() => s.set("animate", !s.animate)}
      >
        Anim
      </button>

      <button
        className="btn"
        disabled={!hasDataset}
        onClick={() => onOpenJournal()}
        title="Open the trade journal (J)"
      >
        📓 Journal
      </button>
      <button className="btn" onClick={() => onShowShortcuts()} title="Keyboard shortcuts (?)">
        ?
      </button>
      <button className="btn" onClick={() => fileRef.current?.click()}>
        Load CSV…
      </button>
      <button
        className="btn"
        disabled={!hasDataset || Object.keys(decisions).length === 0}
        onClick={() => downloadCsv("backtest_results.csv", buildResultsCsv(signals, decisions))}
      >
        Export
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void readFileAndLoad(f);
        }}
      />
      <button className="btn" title="Sign out" onClick={() => void useAuth.getState().signOut()}>
        Sign out
      </button>
    </header>
  );
}
