import type { ParseResult } from "../data/types";
import { parseCsvText, buildBars } from "../data/parse";
import { detectPricePrecision } from "../data/precision";
import { toRawCsv } from "../data/csv";
import { useApp, type DecisionRecord } from "../state/app";
import { useSettings } from "../state/settings";
import { useDrawings } from "../state/drawings";
import { computeSignals } from "../chart/computeSignals";
import { getEngine } from "../chart/engineRef";
import {
  saveDataset,
  getDecisions,
  getDataset,
  getPosition,
  savePosition,
  kvGet,
  kvSet,
  type StoredDataset,
} from "../persistence/db";

/** Stable id for a dataset so reloading the same file resumes its decisions/drawings. */
function datasetId(name: string, res: { bars: { time: number }[] }): string {
  const n = res.bars.length;
  const first = res.bars[0]?.time ?? 0;
  const last = res.bars[n - 1]?.time ?? 0;
  return `${name}|${n}|${first}|${last}`;
}

/** Recompute signals from the current bars + settings and push to store + engine. */
export function recomputeSignals(resetCursor = true) {
  const app = useApp.getState();
  if (!app.bars.length) return;
  const s = useSettings.getState();
  const cs = computeSignals(app.bars, app.csvFlags, app.hasCsvSignals, s);
  useApp.getState().setSignals({ computed: cs.computed, fileSigs: cs.fileSigs, active: cs.active, bands: cs.bands });
  if (resetCursor) useApp.getState().setCur(0);
  useApp.getState().setReveal(0);
  if (app.datasetId) {
    const a = useApp.getState();
    void savePosition(app.datasetId, { cur: a.cur, reveal: a.reveal });
  }

  const engine = getEngine();
  if (!engine) return;
  if (resetCursor) {
    const frontier = cs.active[0]?.barIndex ?? app.bars.length - 1;
    useApp.getState().setFrontier(frontier);
    engine.setSignalsAndBands(cs.active, cs.bands);
    engine.goToFrontier(frontier, "instant");
  } else {
    engine.setSignalsAndBands(cs.active, cs.bands);
  }
}

/** Commit a confident parse result into state + persistence + the engine. */
export async function applyParseResult(name: string, res: ParseResult) {
  const id = datasetId(name, res);
  const app = useApp.getState();

  app.loadDataset({
    id,
    name,
    bars: res.bars,
    csvFlags: res.csvFlags,
    hasCsvSignals: res.hasCsvSignals,
  });
  app.setPricePrecision(detectPricePrecision(res.bars));

  // persist dataset + remember as last-open
  const stored: StoredDataset = {
    id,
    name,
    bars: res.bars,
    csvFlags: res.csvFlags,
    hasCsvSignals: res.hasCsvSignals,
    createdAt: Date.now(),
  };
  void saveDataset(stored);
  void kvSet("lastDataset", id);

  // resume decisions + drawings/trades for this dataset
  const stored2 = await getDecisions(id);
  const decisions: Record<number, DecisionRecord> = {};
  for (const d of stored2) decisions[d.signalTime] = { decision: d.decision, note: d.note, rating: d.rating };
  useApp.getState().hydrateDecisions(decisions);
  void useDrawings.getState().hydrate(id);

  // compute + load chart
  const s = useSettings.getState();
  const cs = computeSignals(res.bars, res.csvFlags, res.hasCsvSignals, s);
  useApp.getState().setSignals({ computed: cs.computed, fileSigs: cs.fileSigs, active: cs.active, bands: cs.bands });

  // resume the saved replay position for this dataset, clamped to valid range
  const saved = await getPosition(id);
  let cur = 0;
  let reveal = 0;
  if (saved && cs.active.length) {
    cur = Math.max(0, Math.min(saved.cur ?? 0, cs.active.length - 1));
    const maxReveal = res.bars.length - 1 - cs.active[cur].barIndex;
    reveal = Math.max(0, Math.min(saved.reveal ?? 0, maxReveal));
  }
  useApp.getState().setCur(cur);
  useApp.getState().setReveal(reveal);

  const frontier = cs.active.length ? cs.active[cur].barIndex + reveal : res.bars.length - 1;
  useApp.getState().setFrontier(frontier);

  const engine = getEngine();
  if (engine) {
    engine.setVisibleHint(s.lookback);
    engine.setFollow(s.followFrontier);
    engine.setAnchor(s.anchor);
    engine.setAnimate(s.animate, s.animMs);
    engine.setShowBands(s.showBands);
    engine.load(res.bars, cs.bands, cs.active, frontier, s.barSpacing);
  }
}

/** Entry point: parse raw CSV text. Returns false if the mapping bar is needed. */
export async function loadCsvText(name: string, text: string): Promise<{ ok: boolean; needsMapping: boolean; error?: string }> {
  let res: ParseResult;
  try {
    res = parseCsvText(text);
  } catch (e) {
    return { ok: false, needsMapping: false, error: (e as Error).message };
  }
  if (!res.confident) {
    useApp.getState().setMapping({
      headers: res.headers,
      rows: [], // rows are re-derived from text on apply; kept light in store
      map: res.map,
      message: "Couldn’t confidently detect columns — confirm the mapping.",
    });
    // stash the raw text for re-parse on apply
    pendingText = { name, text };
    return { ok: false, needsMapping: true };
  }
  await applyParseResult(name, res);
  return { ok: true, needsMapping: false };
}

/** Load a previously-stored dataset by id (used by the dataset switcher). */
export async function openDataset(id: string): Promise<boolean> {
  if (id === useApp.getState().datasetId) return true; // already open
  const ds = await getDataset(id);
  if (!ds) return false;
  await applyParseResult(ds.name, {
    bars: ds.bars,
    csvFlags: ds.csvFlags,
    hasCsvSignals: ds.hasCsvSignals,
    format: "generic",
    map: { date: 0, time: -1, open: 1, high: 2, low: 3, close: 4, volume: 5, buy: -1, sell: -1 },
    headers: [],
    confident: true,
  });
  return true;
}

/** Restore the last-open dataset from storage on startup (persistence). */
export async function restoreLastDataset(): Promise<boolean> {
  const id = await kvGet<string>("lastDataset");
  if (!id) return false;
  return openDataset(id);
}

let pendingText: { name: string; text: string } | null = null;

/** Re-parse the pending file under a user-corrected column map. */
export async function applyMapping(): Promise<{ ok: boolean; error?: string }> {
  const mapping = useApp.getState().mapping;
  if (!mapping || !pendingText) return { ok: false, error: "Nothing to map." };
  try {
    // rebuild raw rows from the stored text using the same low-level parse
    const raw = toRawCsv(pendingText.text);
    const built = buildBars(raw, mapping.map);
    const res: ParseResult = {
      bars: built.bars,
      csvFlags: built.csvFlags,
      hasCsvSignals: built.hasCsvSignals,
      format: "generic",
      map: mapping.map,
      headers: raw.headers,
      confident: true,
    };
    await applyParseResult(pendingText.name, res);
    pendingText = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
