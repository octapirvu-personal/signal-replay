import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type WhitespaceData,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
  type LogicalRange,
} from "lightweight-charts";
import type { Bar } from "../data/types";
import { detectPricePrecision, minMoveFor } from "../data/precision";
import type { Bands, Signal } from "../signals/types";

type CandlePoint = CandlestickData<Time> | WhitespaceData<Time>;
type LinePoint = LineData<Time> | WhitespaceData<Time>;

export interface EngineCallbacks {
  /** Fired when the USER changes zoom (wheel/pinch) so it can be persisted. */
  onZoomChange?: (barSpacing: number) => void;
}

export type NavMode = "instant" | "animated" | "stream";

/**
 * The TradingView-Bar-Replay-style engine.
 *
 * Invariants that make navigation feel right (see build spec §4):
 *  - The series holds ONLY the revealed bars (0..frontier); the future is hidden
 *    by not being present, so the time axis past the frontier never paints.
 *  - Forward reveal uses `series.update()` only — never setData — appending the
 *    next (newer) bar so candles pop in incrementally with no rebuild.
 *  - Zoom is `timeScale.barSpacing`, changed ONLY by the user. Navigation never
 *    touches it. New bars never auto-shift the view (`shiftVisibleRangeOnNewBar`
 *    is off); all panning goes through scrollToPosition under our control.
 *  - Navigation pans with `scrollToPosition()`, never `setVisibleLogicalRange()`.
 *  - Backward (re-hide) is the one case that needs setData; we capture and
 *    restore bar spacing + visible range around it so there is no visible jump.
 *
 * NOTE on the spec's whitespace technique: lightweight-charts v4.2's
 * `series.update()` rejects any point older than the last one ("Cannot update
 * oldest data"), so loading the full series as trailing whitespace and updating
 * interior points into candles is not possible on this version. Appending
 * revealed bars achieves the identical result (no rebuild, stable axis, hidden
 * future) and is the supported path.
 */
export class ReplayEngine {
  private chart: IChartApi;
  private candles: ISeriesApi<"Candlestick">;
  private upper: ISeriesApi<"Line">;
  private basis: ISeriesApi<"Line">;
  private lower: ISeriesApi<"Line">;

  private bars: Bar[] = [];
  private bands: Bands | null = null;
  private signals: Signal[] = [];
  private frontier = -1; // index of last revealed real bar
  private showBands = true;
  private follow = true;
  private anchor = 0.75;
  private animMs = 420;
  private animate = true;
  private precision = 2;

  private suppressUntil = 0;
  private rafId: number | null = null;
  /** Fallback visible-bar count used before the container has laid out. */
  private visibleHint = 120;

  constructor(
    private container: HTMLDivElement,
    barSpacing: number,
    private cb: EngineCallbacks = {},
  ) {
    this.chart = createChart(container, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0e1116" }, textColor: "#8b97a7" },
      grid: { vertLines: { color: "#1c2230" }, horzLines: { color: "#1c2230" } },
      rightPriceScale: { borderColor: "#2a3240" },
      timeScale: {
        borderColor: "#2a3240",
        timeVisible: true,
        secondsVisible: false,
        barSpacing,
        rightOffset: 0,
        // Prevent the lib from auto-fitting (which would reset zoom) on setData
        // and from auto-shifting the view when we append a revealed bar — we
        // own all panning via scrollToPosition.
        fixLeftEdge: false,
        shiftVisibleRangeOnNewBar: false,
        lockVisibleTimeRangeOnResize: true,
      },
      crosshair: { mode: CrosshairMode.Normal },
      // Disable the library's 1:1 pinch — we run a faster custom one below.
      handleScale: { mouseWheel: true, pinch: false, axisPressedMouseMove: true },
    });

    this.setupPinch();

    const bandOpts = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    this.upper = this.chart.addLineSeries({ color: "rgba(239,83,80,.55)", lineStyle: LineStyle.Solid, ...bandOpts });
    this.basis = this.chart.addLineSeries({ color: "rgba(59,130,246,.55)", ...bandOpts });
    this.lower = this.chart.addLineSeries({ color: "rgba(38,166,154,.55)", ...bandOpts });
    this.candles = this.chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    // Persist the user's zoom. We derive barSpacing from the visible logical
    // range + pixel width so it is robust across library versions, and ignore
    // changes we cause ourselves (suppress window).
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range || performance.now() < this.suppressUntil) return;
      const span = range.to - range.from;
      if (span <= 1) return;
      const px = this.container.clientWidth;
      if (px <= 0) return;
      const bs = px / span;
      this.cb.onZoomChange?.(bs);
    });
  }

  // ---------- public config ----------
  setFollow(v: boolean) {
    this.follow = v;
  }
  setAnchor(v: number) {
    this.anchor = v;
  }
  setAnimate(v: boolean, ms: number) {
    this.animate = v;
    this.animMs = ms;
  }
  /** Hint for how many bars the user wants visible (used as width fallback). */
  setVisibleHint(bars: number) {
    if (bars > 0) this.visibleHint = bars;
  }
  setBarSpacing(bs: number) {
    this.suppress();
    this.chart.applyOptions({ timeScale: { barSpacing: bs } });
  }
  setShowBands(show: boolean) {
    if (show === this.showBands) return;
    this.showBands = show;
    const vis = show;
    this.upper.applyOptions({ visible: vis });
    this.basis.applyOptions({ visible: vis });
    this.lower.applyOptions({ visible: vis });
  }

  getChart() {
    return this.chart;
  }
  getCandleSeries() {
    return this.candles;
  }
  /** Decimal precision the chart is currently formatting prices at. */
  getPricePrecision() {
    return this.precision;
  }
  /** Apply a price decimal precision to the axis, crosshair, and all series. */
  setPricePrecision(precision: number) {
    this.precision = precision;
    const priceFormat = { type: "price" as const, precision, minMove: minMoveFor(precision) };
    this.candles.applyOptions({ priceFormat });
    this.upper.applyOptions({ priceFormat });
    this.basis.applyOptions({ priceFormat });
    this.lower.applyOptions({ priceFormat });
  }

  // ---------- loading ----------
  /** Load a dataset. Sets all bars once with the future whitespaced at `frontier`. */
  load(bars: Bar[], bands: Bands | null, signals: Signal[], frontier: number, barSpacing: number) {
    this.cancelAnim();
    this.bars = bars;
    this.bands = bands;
    this.signals = signals;
    this.frontier = Math.max(-1, Math.min(frontier, bars.length - 1));

    this.setPricePrecision(detectPricePrecision(bars));
    this.suppress(180);
    this.candles.setData(this.buildCandles(this.frontier));
    if (bands) {
      this.upper.setData(this.buildLine(bands.upper, this.frontier));
      this.basis.setData(this.buildLine(bands.basis, this.frontier));
      this.lower.setData(this.buildLine(bands.lower, this.frontier));
    } else {
      this.upper.setData([]);
      this.basis.setData([]);
      this.lower.setData([]);
    }
    this.refreshMarkers();
    // Pin the persisted zoom (setData can otherwise auto-fit).
    this.chart.applyOptions({ timeScale: { barSpacing } });
    // Anchor synchronously (with a width fallback so it works before layout),
    // then re-anchor once on the next frame in case the container has since
    // sized up. Never depend on rAF for the final position to be correct.
    this.scrollToAnchor(false);
    requestAnimationFrame(() => this.scrollToAnchor(false));
  }

  /** Replace just the signals/bands (e.g. strategy params changed) without moving. */
  setSignalsAndBands(signals: Signal[], bands: Bands | null) {
    this.signals = signals;
    this.bands = bands;
    const range = this.chart.timeScale().getVisibleLogicalRange();
    const bs = this.currentBarSpacing();
    if (bands) {
      this.upper.setData(this.buildLine(bands.upper, this.frontier));
      this.basis.setData(this.buildLine(bands.basis, this.frontier));
      this.lower.setData(this.buildLine(bands.lower, this.frontier));
    }
    this.refreshMarkers();
    this.restoreView(bs, range);
  }

  // ---------- navigation ----------
  /**
   * Move the replay frontier to `target`. Forward = incremental update() (smooth
   * stream-in); backward = setData rebuild with view capture/restore (no jump).
   * Scrolling only happens when `follow` is on.
   */
  goToFrontier(target: number, mode: NavMode = "animated") {
    this.cancelAnim();
    const t = Math.max(0, Math.min(target, this.bars.length - 1));
    if (t === this.frontier) {
      if (this.follow) this.scrollToAnchor(mode !== "instant");
      return;
    }

    if (t > this.frontier) {
      // Stream only when we can actually animate (rAF runs); otherwise reveal
      // instantly so the final state is always correct.
      const wantStream = this.animate && (mode === "stream" || mode === "animated") && !document.hidden;
      if (wantStream) this.streamForward(t);
      else {
        this.revealRange(this.frontier + 1, t);
        this.frontier = t;
        this.refreshMarkers();
        if (this.follow) this.scrollToAnchor(mode !== "instant");
      }
    } else {
      // backward → stream candles back out, mirroring the forward animation;
      // fall back to an instant rebuild when we can't animate.
      const wantStream = this.animate && (mode === "stream" || mode === "animated") && !document.hidden;
      if (wantStream) {
        this.streamBackward(t);
      } else {
        const range = this.chart.timeScale().getVisibleLogicalRange();
        const bs = this.currentBarSpacing();
        this.applyBackward(t, bs, range);
        if (this.follow) this.scrollToAnchor(mode !== "instant");
      }
    }
  }

  /** Rebuild series for frontier `f` (used by both instant and streamed backward). */
  private applyBackward(f: number, bs: number, range: LogicalRange | null) {
    this.frontier = f;
    this.suppress(140);
    this.candles.setData(this.buildCandles(f));
    if (this.bands) {
      this.upper.setData(this.buildLine(this.bands.upper, f));
      this.basis.setData(this.buildLine(this.bands.basis, f));
      this.lower.setData(this.buildLine(this.bands.lower, f));
    }
    this.refreshMarkers();
    if (this.follow) this.scrollToAnchor(false);
    else this.restoreView(bs, range);
  }

  /** Stream candles back out from the current frontier to `target` over animMs. */
  private streamBackward(target: number) {
    const from = this.frontier;
    const total = from - target;
    const range0 = this.chart.timeScale().getVisibleLogicalRange();
    const bs = this.currentBarSpacing();
    const t0 = performance.now();
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / this.animMs);
      const want = from - Math.round(ease(p) * total);
      if (want < this.frontier) this.applyBackward(want, bs, range0);
      if (p < 1) this.rafId = requestAnimationFrame(step);
      else {
        this.rafId = null;
        if (this.frontier > target) this.applyBackward(target, bs, range0);
      }
    };
    this.rafId = requestAnimationFrame(step);
  }

  /** Stream candles in from the current frontier to `target` over animMs. */
  private streamForward(target: number) {
    const from = this.frontier;
    const total = target - from;
    const t0 = performance.now();
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / this.animMs);
      const want = from + Math.round(ease(p) * total);
      if (want > this.frontier) {
        this.revealRange(this.frontier + 1, want);
        this.frontier = want;
        this.refreshMarkers();
      }
      if (this.follow) this.scrollToAnchor(false);
      if (p < 1) this.rafId = requestAnimationFrame(step);
      else {
        this.rafId = null;
        if (this.frontier < target) {
          this.revealRange(this.frontier + 1, target);
          this.frontier = target;
          this.refreshMarkers();
          if (this.follow) this.scrollToAnchor(false);
        }
      }
    };
    this.rafId = requestAnimationFrame(step);
  }

  /** Reveal bars [from..to] inclusive with update() (no rebuild). */
  private revealRange(from: number, to: number) {
    for (let i = from; i <= to; i++) {
      this.candles.update(this.realCandle(i));
      if (this.bands) {
        this.upper.update(this.lineAt(this.bands.upper, i));
        this.basis.update(this.lineAt(this.bands.basis, i));
        this.lower.update(this.lineAt(this.bands.lower, i));
      }
    }
  }

  // ---------- scrolling ----------
  /** Position the frontier at the configured anchor across the viewport. */
  private scrollToAnchor(animated: boolean) {
    const N = this.bars.length;
    if (N === 0) return;
    const bs = this.currentBarSpacing();
    const width = this.container.clientWidth;
    // visible bar count: real width if laid out, else fall back to the user's
    // intended lookback so the first paint is already correctly anchored.
    const visibleBars = width > 0 ? width / Math.max(bs, 0.5) : this.visibleHint;
    const rightGap = Math.round((1 - this.anchor) * visibleBars);
    // scrollPosition is measured from the right edge to the LAST REAL bar
    // (the frontier), so the offset to leave the frontier `rightGap` bars in
    // from the right edge is simply rightGap. (Spec §4.2.4: offsetFromRightInBars.)
    const doAnimate = animated && !document.hidden;
    this.suppress(doAnimate ? this.animMs + 80 : 120);
    this.chart.timeScale().scrollToPosition(rightGap, doAnimate);
  }

  // ---------- helpers ----------
  private currentBarSpacing(): number {
    // timeScale options reflect the current (possibly user-zoomed) spacing.
    return this.chart.timeScale().options().barSpacing;
  }

  private restoreView(barSpacing: number, range: LogicalRange | null) {
    this.suppress(140);
    this.chart.applyOptions({ timeScale: { barSpacing } });
    if (range) this.chart.timeScale().setVisibleLogicalRange(range);
  }

  private suppress(ms = 120) {
    this.suppressUntil = performance.now() + ms;
  }

  private realCandle(i: number): CandlestickData<Time> {
    const b = this.bars[i];
    return { time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close };
  }
  private lineAt(arr: number[], i: number): LinePoint {
    const v = arr[i];
    const time = this.bars[i].time as UTCTimestamp;
    return Number.isNaN(v) ? { time } : { time, value: v };
  }

  /** Real candles for 0..frontier only — the future is simply absent. */
  private buildCandles(frontier: number): CandlePoint[] {
    const n = Math.max(0, Math.min(frontier, this.bars.length - 1) + 1);
    const out: CandlePoint[] = new Array(n);
    for (let i = 0; i < n; i++) out[i] = this.realCandle(i);
    return out;
  }
  /** Band line for 0..frontier; warmup (NaN) bars become interior whitespace. */
  private buildLine(arr: number[], frontier: number): LinePoint[] {
    const n = Math.max(0, Math.min(frontier, this.bars.length - 1) + 1);
    const out: LinePoint[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const time = this.bars[i].time as UTCTimestamp;
      out[i] = Number.isNaN(arr[i]) ? { time } : { time, value: arr[i] };
    }
    return out;
  }

  private refreshMarkers() {
    const markers: SeriesMarker<Time>[] = [];
    for (const s of this.signals) {
      if (s.barIndex > this.frontier) break; // signals are sorted ascending
      markers.push({
        time: s.time as UTCTimestamp,
        position: s.type === "buy" ? "belowBar" : "aboveBar",
        color: s.type === "buy" ? "#26a69a" : "#ef5350",
        shape: s.type === "buy" ? "arrowUp" : "arrowDown",
      });
    }
    this.candles.setMarkers(markers);
  }

  private cancelAnim() {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getFrontier() {
    return this.frontier;
  }

  // ---------- faster two-finger pinch zoom (TradingView-like) ----------
  private pinchStart: { dist: number; bs: number } | null = null;

  private setupPinch() {
    this.container.addEventListener("touchstart", this.onTouchStart, { passive: true });
    this.container.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.container.addEventListener("touchend", this.onTouchEnd);
    this.container.addEventListener("touchcancel", this.onTouchEnd);
  }
  private teardownPinch() {
    this.container.removeEventListener("touchstart", this.onTouchStart);
    this.container.removeEventListener("touchmove", this.onTouchMove);
    this.container.removeEventListener("touchend", this.onTouchEnd);
    this.container.removeEventListener("touchcancel", this.onTouchEnd);
  }
  private onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) this.pinchStart = { dist: touchDist(e.touches), bs: this.currentBarSpacing() };
  };
  private onTouchMove = (e: TouchEvent) => {
    if (!this.pinchStart || e.touches.length !== 2) return;
    e.preventDefault();
    // Amplify the finger-distance ratio so a small pinch zooms a lot more than
    // the library's 1:1 default — far fewer finger movements to zoom.
    const AMP = 1.8;
    const ratio = touchDist(e.touches) / this.pinchStart.dist;
    const bs = Math.max(0.6, Math.min(80, this.pinchStart.bs * Math.pow(ratio, AMP)));
    this.chart.timeScale().applyOptions({ barSpacing: bs });
  };
  private onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) this.pinchStart = null;
  };

  destroy() {
    this.cancelAnim();
    this.teardownPinch();
    this.chart.remove();
  }
}

function touchDist(t: TouchList): number {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}
