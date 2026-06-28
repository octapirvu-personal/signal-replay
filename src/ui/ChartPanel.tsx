import { useEffect, useRef, useState } from "react";
import { ReplayEngine } from "../chart/replayEngine";
import { setEngine, getEngine } from "../chart/engineRef";
import { useApp } from "../state/app";
import { useSettings } from "../state/settings";
import { readFileAndLoad, loadSample } from "../app/fileLoad";
import { buildOverlays } from "../signals/indicators";
import { DrawingOverlay } from "./DrawingOverlay";
import { SelectionToolbar } from "./SelectionToolbar";

export function ChartPanel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const hasDataset = useApp((s) => s.datasetId != null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  // Create the engine once. If a dataset is already in the store (restored
  // session), load it immediately.
  useEffect(() => {
    if (!hostRef.current) return;
    const s = useSettings.getState();
    const engine = new ReplayEngine(hostRef.current, s.barSpacing, {
      onZoomChange: (bs) => useSettings.getState().set("barSpacing", bs),
    });
    engine.setVisibleHint(s.lookback);
    engine.setFollow(s.followFrontier);
    engine.setAnchor(s.anchor);
    engine.setAnimate(s.animate, s.animMs);
    setEngine(engine);
    setReady(true);

    engine.setShowMarkers(s.showBands);
    const app = useApp.getState();
    if (app.bars.length) {
      const frontier = app.signals[app.cur]?.barIndex ?? app.bars.length - 1;
      app.setFrontier(frontier + app.reveal);
      engine.load(app.bars, buildOverlays(app.bars, app.bands, s), app.signals, frontier + app.reveal, s.barSpacing);
    }
    return () => {
      engine.destroy();
      setEngine(null);
      setReady(false);
    };
  }, []);

  // Push reactive settings into the imperative engine.
  const follow = useSettings((s) => s.followFrontier);
  const anchor = useSettings((s) => s.anchor);
  const animate = useSettings((s) => s.animate);
  const animMs = useSettings((s) => s.animMs);
  const showBands = useSettings((s) => s.showBands);
  const showEma = useSettings((s) => s.showEma);
  useEffect(() => void getEngine()?.setFollow(follow), [follow]);
  useEffect(() => void getEngine()?.setAnchor(anchor), [anchor]);
  useEffect(() => void getEngine()?.setAnimate(animate, animMs), [animate, animMs]);
  // Rebuild the indicator overlays whenever an indicator toggle changes; the
  // buy/sell signal arrows follow the Bollinger Bands toggle.
  useEffect(() => {
    const e = getEngine();
    if (!e) return;
    const app = useApp.getState();
    e.setOverlays(buildOverlays(app.bars, app.bands, { showBands, showEma }));
    e.setShowMarkers(showBands);
  }, [showBands, showEma]);

  async function handleFiles(files: FileList | null) {
    if (!files || !files[0]) return;
    setError("");
    const res = await readFileAndLoad(files[0]);
    if (!res.ok && !res.needsMapping && res.error) setError(res.error);
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div id="chart-host" ref={hostRef} className="absolute inset-0" />

      {ready && hasDataset && <DrawingOverlay />}
      {ready && hasDataset && <SelectionToolbar />}

      {hasDataset && (
        <div className="pointer-events-none absolute right-3.5 top-2.5 z-20 rounded-md border border-line bg-black/40 px-2.5 py-1 text-[11px] text-muted">
          future hidden
        </div>
      )}

      {!hasDataset && (
        <div
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-bg text-center ${
            dragOver ? "outline-dashed outline-2 -outline-offset-[16px] outline-accent" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFiles(e.dataTransfer.files);
          }}
        >
          <div className="text-lg font-semibold">Drop your OHLC CSV here</div>
          <div className="max-w-xl text-[13px] leading-relaxed text-muted">
            Supports MetaTrader 4 / MT5 exports, TradingView CSVs, and generic OHLC. The chart freezes at each
            signal; future bars stay hidden until you reveal them. If columns can’t be auto-detected, a mapping
            bar appears.
          </div>
          <div className="flex gap-2">
            <label className="btn btn-primary cursor-pointer">
              Choose file…
              <input
                type="file"
                accept=".csv,.txt,text/csv"
                className="hidden"
                onChange={(e) => void handleFiles(e.target.files)}
              />
            </label>
            <button className="btn" onClick={() => void loadSample()}>
              Load sample
            </button>
          </div>
          {error && <div className="text-xs text-sell">{error}</div>}
        </div>
      )}
    </div>
  );
}
