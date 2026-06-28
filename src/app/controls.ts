import { useApp, type DecisionKind } from "../state/app";
import { useSettings } from "../state/settings";
import { useDrawings } from "../state/drawings";
import { getEngine } from "../chart/engineRef";
import { evaluateTrade } from "../backtest/trades";
import { saveDecision, deleteDecision, savePosition } from "../persistence/db";

function frontierFor(barIndex: number, reveal: number): number {
  return barIndex + reveal;
}

// ---- replay position persistence (resume on reload) ----
let posTimer: ReturnType<typeof setTimeout> | null = null;
/** Debounced save of the current replay position for the active dataset. */
function persistPosition() {
  if (posTimer) clearTimeout(posTimer);
  posTimer = setTimeout(flushPosition, 250);
}
/** Write the current position immediately (cancels any debounce). */
export function flushPosition() {
  if (posTimer) {
    clearTimeout(posTimer);
    posTimer = null;
  }
  const a = useApp.getState();
  if (!a.datasetId) return;
  void savePosition(a.datasetId, { cur: a.cur, reveal: a.reveal });
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPosition);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPosition();
  });
}

/** Jump to signal index `i`, reset reveal, and navigate the chart. */
export function gotoSignal(i: number) {
  const app = useApp.getState();
  if (!app.signals.length) return;
  const cur = Math.max(0, Math.min(i, app.signals.length - 1));
  app.setCur(cur);
  app.setReveal(0);
  app.setFrontier(app.signals[cur].barIndex);
  persistPosition();
  getEngine()?.goToFrontier(app.signals[cur].barIndex, "animated");
}

export function nextSignal() {
  const { cur } = useApp.getState();
  gotoSignal(cur + 1);
}
export function prevSignal() {
  const { cur } = useApp.getState();
  gotoSignal(cur - 1);
}

/**
 * Jump the chart to a journalled trade: select it, and reveal through its exit
 * (or a little past the entry if still open) so the whole trade is visible.
 */
export function gotoTrade(tradeId: string) {
  const d = useDrawings.getState();
  const t = d.trades.find((x) => x.id === tradeId);
  if (!t) return;
  d.select({ kind: "trade", id: t.id });
  const app = useApp.getState();
  if (!app.bars.length) return;
  const r = evaluateTrade(app.bars, t);
  const target = Math.min(app.bars.length - 1, (r.exitBarIndex ?? t.entryBarIndex + 20) + 3);
  getEngine()?.goToFrontier(target, "animated");
}

/** Reveal `n` more bars past the current signal (forward, smooth). */
export function revealMore(n: number) {
  const app = useApp.getState();
  if (!app.signals.length) return;
  const sg = app.signals[app.cur];
  const max = app.bars.length - 1 - sg.barIndex;
  const reveal = Math.min(max, app.reveal + n);
  app.setReveal(reveal);
  app.setFrontier(frontierFor(sg.barIndex, reveal));
  persistPosition();
  getEngine()?.goToFrontier(frontierFor(sg.barIndex, reveal), "stream");
}

/** Re-hide `n` bars (backward). */
export function hideSome(n: number) {
  const app = useApp.getState();
  if (!app.signals.length) return;
  const sg = app.signals[app.cur];
  const reveal = Math.max(0, app.reveal - n);
  app.setReveal(reveal);
  app.setFrontier(frontierFor(sg.barIndex, reveal));
  persistPosition();
  getEngine()?.goToFrontier(frontierFor(sg.barIndex, reveal), "animated");
}

export function stepForward() {
  revealMore(1);
}
export function stepBack() {
  hideSome(1);
}

// ---- candle-by-candle stepping (auto-skips the 22:00–07:30 overnight zone) ----
const DEAD_START_MIN = 22 * 60; // 22:00 UTC
const SESSION_START_MIN = 7 * 60 + 30; // 07:30 UTC
function inDeadZone(timeSec: number): boolean {
  const d = new Date(timeSec * 1000);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return m >= DEAD_START_MIN || m < SESSION_START_MIN; // wraps midnight
}

/** Reveal the next candle; if it lands in 22:00–07:30, jump past to 07:30. */
export function stepForwardSkip() {
  const app = useApp.getState();
  const sg = app.signals[app.cur];
  if (!sg) return;
  const maxReveal = app.bars.length - 1 - sg.barIndex;
  if (app.reveal >= maxReveal) return;
  let reveal = app.reveal + 1;
  while (reveal < maxReveal && inDeadZone(app.bars[sg.barIndex + reveal].time)) reveal++;
  app.setReveal(reveal);
  app.setFrontier(frontierFor(sg.barIndex, reveal));
  persistPosition();
  getEngine()?.goToFrontier(frontierFor(sg.barIndex, reveal), "stream");
}

/** Hide the last candle; skip back over the 22:00–07:30 dead zone. */
export function stepBackSkip() {
  const app = useApp.getState();
  const sg = app.signals[app.cur];
  if (!sg || app.reveal <= 0) return;
  let reveal = app.reveal - 1;
  while (reveal > 0 && inDeadZone(app.bars[sg.barIndex + reveal].time)) reveal--;
  app.setReveal(reveal);
  app.setFrontier(frontierFor(sg.barIndex, reveal));
  persistPosition();
  getEngine()?.goToFrontier(frontierFor(sg.barIndex, reveal), "animated");
}

/** Bottom-bar navigation: candle-step (dead-zone-aware) or jump to next signal. */
export function navForward() {
  if (useSettings.getState().stepMode) stepForwardSkip();
  else nextSignal();
}
export function navBack() {
  if (useSettings.getState().stepMode) stepBackSkip();
  else prevSignal();
}

/** Record / toggle a take/skip decision for the current signal; persists to IndexedDB. */
export function decide(kind: DecisionKind) {
  const app = useApp.getState();
  if (!app.signals.length) return;
  const sg = app.signals[app.cur];
  const existing = app.decisions[sg.time];
  const datasetId = app.datasetId;
  if (existing && existing.decision === kind) {
    // toggle off
    app.setDecision(sg.time, null);
    if (datasetId) void deleteDecision(`${datasetId}:${sg.time}`);
    return;
  }
  const rec = { decision: kind, note: existing?.note, rating: existing?.rating };
  app.setDecision(sg.time, rec);
  if (datasetId)
    void saveDecision({
      key: `${datasetId}:${sg.time}`,
      datasetId,
      signalTime: sg.time,
      decision: kind,
      note: rec.note,
      rating: rec.rating,
      updatedAt: Date.now(),
    });
}

export function setNote(note: string) {
  const app = useApp.getState();
  if (!app.signals.length) return;
  const sg = app.signals[app.cur];
  const existing = app.decisions[sg.time];
  if (!existing) return; // only annotate decided signals
  const rec = { ...existing, note };
  app.setDecision(sg.time, rec);
  const datasetId = app.datasetId;
  if (datasetId)
    void saveDecision({
      key: `${datasetId}:${sg.time}`,
      datasetId,
      signalTime: sg.time,
      decision: rec.decision,
      note: rec.note,
      rating: rec.rating,
      updatedAt: Date.now(),
    });
}

export function setRating(rating: string) {
  const app = useApp.getState();
  if (!app.signals.length) return;
  const sg = app.signals[app.cur];
  const existing = app.decisions[sg.time];
  if (!existing) return;
  const rec = { ...existing, rating };
  app.setDecision(sg.time, rec);
  const datasetId = app.datasetId;
  if (datasetId)
    void saveDecision({
      key: `${datasetId}:${sg.time}`,
      datasetId,
      signalTime: sg.time,
      decision: rec.decision,
      note: rec.note,
      rating: rec.rating,
      updatedAt: Date.now(),
    });
}

/** Apply a barSpacing change derived from a desired visible-bar count. */
export function setLookback(bars: number) {
  const engine = getEngine();
  const el = document.getElementById("chart-host");
  const width = el?.clientWidth ?? 1000;
  const bs = Math.max(1, width / Math.max(10, bars));
  useSettings.getState().set("lookback", bars);
  useSettings.getState().set("barSpacing", bs);
  engine?.setBarSpacing(bs);
}
