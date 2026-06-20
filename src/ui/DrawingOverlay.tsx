import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Logical } from "lightweight-charts";
import { getEngine } from "../chart/engineRef";
import { useApp } from "../state/app";
import { useSettings } from "../state/settings";
import { useDrawings } from "../state/drawings";
import { evaluateTrade, type Trade, type TradeDirection } from "../backtest/trades";
import { pipSizeFor } from "../backtest/journal";
import { formatTime } from "../data/time";
import type { Anchor, Trendline } from "../drawings/types";
import { LONG_COLOR, SHORT_COLOR, DEFAULT_LINE_COLOR } from "../drawings/types";
import { makeTradeId, makeTrendlineId, tradeContext } from "../app/drawingControls";
import { useIsTouch } from "./useIsMobile";

const HANDLE_R = 4.5;
const FWD_PX = 200; // forward extent of an open trade box
const CLICK_TOL = 4; // px movement under which a press counts as a click

const DASH: Record<string, string | undefined> = { solid: undefined, dashed: "6 4", dotted: "2 4" };

/** Draft of an in-progress drawing (trendline or trade), following the cursor. */
interface Draft {
  tool: "trendline" | "long" | "short";
  start: Anchor;
  end: Anchor;
}

type DragState =
  | { kind: "trendline"; id: string; part: "a" | "b" | "body"; startA: Anchor; startB: Anchor; startIdx: number; startPrice: number }
  | { kind: "trade"; id: string; part: "entry" | "sl" | "tp" | "body" }
  | null;

export function DrawingOverlay() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => (v + 1) % 1_000_000);
  // Render synchronously so drawings stay glued to the chart while panning /
  // zooming — a normal (deferred) React render trails a frame behind the
  // canvas and the drawings look jiggly / lagging during fast scrolls.
  const syncBump = () => {
    try {
      flushSync(bump);
    } catch {
      bump();
    }
  };

  const bars = useApp((s) => s.bars);
  const precision = useApp((s) => s.pricePrecision);
  const frontier = useApp((s) => s.frontier);
  const magnet = useSettings((s) => s.magnet);
  const rr = useSettings((s) => s.tradeRR);
  const { tool, trendlines, trades, selection, setTool, select, addTrendline, addTrade, updateTrendline, updateTrade } =
    useDrawings();

  // in-progress draft (state for render + ref for handler freshness)
  const [draft, _setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const setDraft = (d: Draft | null) => {
    draftRef.current = d;
    _setDraft(d);
  };
  const downClient = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const dragRef = useRef<DragState>(null);
  // While an entry/SL/TP handle is held, draw a full-width dotted level line
  // (like the crosshair) plus a live price tag on the Y axis.
  const [editLevel, setEditLevel] = useState<{ id: string; part: "sl" | "tp" | "entry" } | null>(null);
  // Trade currently under the cursor — reveals its drag dots + info chips.
  const [hoverId, setHoverId] = useState<string | null>(null);

  const touch = useIsTouch();

  const engine = getEngine();
  const chart = engine?.getChart();
  const series = engine?.getCandleSeries();

  const timeIndex = useMemo(() => {
    const m = new Map<number, number>();
    bars.forEach((b, i) => m.set(b.time, i));
    return m;
  }, [bars]);

  // Bar index where each committed trade first touches its SL or TP, evaluated
  // against only the bars revealed so far (never peeking past the frontier) so
  // the plot snaps to the exit candle as the replay reaches it. null = still
  // open (no level hit yet within the revealed range).
  const tradeExitIdx = useMemo(() => {
    const revealed = frontier >= 0 ? bars.slice(0, frontier + 1) : bars;
    const m = new Map<string, number | null>();
    for (const t of trades) m.set(t.id, evaluateTrade(revealed, t).exitBarIndex);
    return m;
  }, [trades, bars, frontier]);

  // re-render on pan / zoom / crosshair / resize so anchors stay glued
  useEffect(() => {
    if (!chart) return;
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(syncBump);
    chart.subscribeCrosshairMove(syncBump);
    // Clicking empty chart space (anything not on a drawing) clears the
    // selection — TradingView-style — so the handles/toolbar disappear. Clicks
    // that land on a drawing are swallowed by the overlay and never reach the
    // chart, so this only fires for true background clicks.
    const onChartClick = () => {
      const d = useDrawings.getState();
      if (d.tool === "cursor" && d.selection) d.select(null);
    };
    chart.subscribeClick(onChartClick);
    const ro = new ResizeObserver(syncBump);
    if (svgRef.current?.parentElement) ro.observe(svgRef.current.parentElement);
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(syncBump);
      chart.unsubscribeCrosshairMove(syncBump);
      chart.unsubscribeClick(onChartClick);
      ro.disconnect();
    };
  }, [chart]);

  // lock chart pan/zoom while a draw tool is active
  useEffect(() => {
    if (!chart) return;
    const lock = tool !== "cursor";
    chart.applyOptions({ handleScroll: !lock, handleScale: !lock });
  }, [chart, tool]);

  // leaving a draw tool cancels any in-progress draft (e.g. Esc)
  useEffect(() => {
    if (tool === "cursor") setDraft(null);
  }, [tool]);

  if (!chart || !series) return null;
  const ts = chart.timeScale();

  // ---------- coordinate helpers ----------
  const xOfTime = (t: number): number | null => {
    const i = timeIndex.get(t);
    if (i == null) return null;
    return ts.logicalToCoordinate(i as Logical);
  };
  const yOfPrice = (p: number): number | null => series.priceToCoordinate(p);

  const snapPrice = (idx: number, price: number): number => {
    if (!magnet || !bars[idx]) return price;
    const b = bars[idx];
    const opts = [b.open, b.high, b.low, b.close];
    return opts.reduce((best, v) => (Math.abs(v - price) < Math.abs(best - price) ? v : best), opts[0]);
  };
  const localXY = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const barFromX = (x: number): number | null => {
    const lg = ts.coordinateToLogical(x);
    if (lg == null) return null;
    return Math.max(0, Math.min(bars.length - 1, Math.round(lg)));
  };
  const anchorFromEvent = (e: { clientX: number; clientY: number }): (Anchor & { idx: number }) | null => {
    const { x, y } = localXY(e);
    const idx = barFromX(x);
    const price = series.coordinateToPrice(y);
    if (idx == null || price == null) return null;
    return { idx, time: bars[idx].time, price: snapPrice(idx, price) };
  };

  // ---------- commit a draft ----------
  const commit = (d: Draft) => {
    if (d.tool === "trendline") {
      if (d.start.time === d.end.time && d.start.price === d.end.price) return;
      const id = makeTrendlineId();
      addTrendline({
        id,
        type: "trendline",
        a: { ...d.start },
        b: { ...d.end },
        color: DEFAULT_LINE_COLOR,
        width: 0.75,
        style: "solid",
        extend: "none",
      });
      select({ kind: "trendline", id });
    } else {
      const t = tradeFromDraft(d, rr, timeIndex.get(d.start.time) ?? 0);
      if (!t) return;
      addTrade(t);
      select({ kind: "trade", id: t.id });
    }
    setTool("cursor");
  };

  // ---------- draw-tool pointer flow (overlay captures all events) ----------
  const onPointerDown = (e: React.PointerEvent) => {
    if (tool === "cursor") {
      if (e.target === svgRef.current) select(null); // empty click → deselect
      return;
    }
    e.preventDefault();
    const a = anchorFromEvent(e);
    if (!a) return;
    if (!draftRef.current) {
      // first point — begin live placement
      setDraft({ tool, start: { time: a.time, price: a.price }, end: { time: a.time, price: a.price } });
      downClient.current = { x: e.clientX, y: e.clientY };
      movedRef.current = false;
      svgRef.current?.setPointerCapture?.(e.pointerId);
    } else {
      // second click → commit
      commit({ ...draftRef.current, end: { time: a.time, price: a.price } });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = draftRef.current;
    if (!d) return;
    const a = anchorFromEvent(e);
    if (!a) return;
    if (downClient.current) {
      const dx = e.clientX - downClient.current.x;
      const dy = e.clientY - downClient.current.y;
      if (Math.hypot(dx, dy) > CLICK_TOL) movedRef.current = true;
    }
    setDraft({ ...d, end: { time: a.time, price: a.price } });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = draftRef.current;
    if (!d) return;
    // a press-drag-release commits; a simple click keeps placing (commit on 2nd click)
    if (movedRef.current) {
      const a = anchorFromEvent(e);
      commit({ ...d, end: a ? { time: a.time, price: a.price } : d.end });
    }
  };

  // ---------- dragging existing objects (cursor tool) ----------
  const detachDrag = () => {
    window.removeEventListener("pointermove", onObjDragMove);
    window.removeEventListener("pointerup", endObjDrag);
    window.removeEventListener("pointercancel", endObjDrag);
  };
  const startObjDrag = (e: React.PointerEvent, drag: NonNullable<DragState>) => {
    e.stopPropagation();
    e.preventDefault();
    detachDrag(); // clear any dangling drag (e.g. a prior touch that never got pointerup)
    dragRef.current = drag;
    if (drag.kind === "trade" && (drag.part === "sl" || drag.part === "tp" || drag.part === "entry")) {
      setEditLevel({ id: drag.id, part: drag.part });
    }
    // capture so we reliably get move/up/cancel even if the finger leaves the
    // element, and so we get notified the moment the gesture is interrupted.
    try {
      const el = e.currentTarget as Element;
      el.setPointerCapture?.(e.pointerId);
      // lostpointercapture is the catch-all: it fires on finger-up AND on any
      // interruption (second touch, element removed) — guaranteeing the drag
      // ends and the chart never stays locked ("stuck") on mobile.
      el.addEventListener("lostpointercapture", endObjDrag, { once: true });
    } catch {
      /* not all targets support capture */
    }
    chart.applyOptions({ handleScroll: false, handleScale: false });
    window.addEventListener("pointermove", onObjDragMove);
    window.addEventListener("pointerup", endObjDrag);
    // touch gestures fire pointercancel (not pointerup) when the browser takes
    // over for scroll/zoom — without this the drag never ends.
    window.addEventListener("pointercancel", endObjDrag);
  };
  const onObjDragMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const a = anchorFromEvent(e);
    if (!a) return;
    if (d.kind === "trendline") {
      if (d.part === "a") updateTrendline(d.id, { a: { time: a.time, price: a.price } });
      else if (d.part === "b") updateTrendline(d.id, { b: { time: a.time, price: a.price } });
      else {
        const dIdx = a.idx - d.startIdx;
        const dPrice = a.price - d.startPrice;
        const shift = (an: Anchor): Anchor => {
          const i = timeIndex.get(an.time);
          const ni = i == null ? null : Math.max(0, Math.min(bars.length - 1, i + dIdx));
          return { time: ni == null ? an.time : bars[ni].time, price: an.price + dPrice };
        };
        updateTrendline(d.id, { a: shift(d.startA), b: shift(d.startB) });
      }
    } else {
      if (d.part === "sl") updateTrade(d.id, { sl: a.price });
      else if (d.part === "tp") updateTrade(d.id, { tp: a.price });
      else if (d.part === "entry") updateTrade(d.id, { entryTime: a.time, entryBarIndex: a.idx, entryPrice: a.price });
      else updateTrade(d.id, { entryTime: a.time, entryBarIndex: a.idx });
    }
  };
  const endObjDrag = () => {
    dragRef.current = null;
    setEditLevel(null);
    chart.applyOptions({ handleScroll: tool === "cursor", handleScale: tool === "cursor" });
    detachDrag();
  };

  const interactive = tool !== "cursor";
  const draftTrade = draft && draft.tool !== "trendline" ? tradeFromDraft(draft, rr, 0) : null;

  // time label for the current (frontier) candle, pinned on the x-axis strip
  const fIdx = bars.length ? Math.max(0, Math.min(frontier, bars.length - 1)) : -1;
  const frontierTime = fIdx >= 0 ? bars[fIdx].time : null;
  const xFrontier = frontierTime != null ? xOfTime(frontierTime) : null;
  const axisH = ts.height();
  const svgH = svgRef.current?.clientHeight ?? 0;
  const svgW = svgRef.current?.clientWidth ?? 0;
  const paneW = ts.width(); // chart pane width = left edge of the right price scale

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      className="absolute inset-0 z-10 h-full w-full"
      style={{ pointerEvents: interactive ? "auto" : "none", cursor: interactive ? "crosshair" : "default", touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* committed trendlines */}
      {trendlines.map((tl) => (
        <TrendlineView
          key={tl.id}
          tl={tl}
          xa={xOfTime(tl.a.time)}
          ya={yOfPrice(tl.a.price)}
          xb={xOfTime(tl.b.time)}
          yb={yOfPrice(tl.b.price)}
          selected={selection?.kind === "trendline" && selection.id === tl.id}
          onSelectBody={(e) => {
            if (tool !== "cursor") return;
            select({ kind: "trendline", id: tl.id });
            startObjDrag(e, {
              kind: "trendline",
              id: tl.id,
              part: "body",
              startA: tl.a,
              startB: tl.b,
              startIdx: barFromX(localXY(e).x) ?? 0,
              startPrice: series.coordinateToPrice(localXY(e).y) ?? tl.a.price,
            });
          }}
          onHandle={(part, e) => {
            if (tool !== "cursor") return;
            select({ kind: "trendline", id: tl.id });
            startObjDrag(e, { kind: "trendline", id: tl.id, part, startA: tl.a, startB: tl.b, startIdx: 0, startPrice: 0 });
          }}
        />
      ))}

      {/* live trendline preview */}
      {draft && draft.tool === "trendline" && (
        <DraftLine xa={xOfTime(draft.start.time)} ya={yOfPrice(draft.start.price)} xb={xOfTime(draft.end.time)} yb={yOfPrice(draft.end.price)} />
      )}

      {/* committed trades */}
      {trades.map((t) => (
        <TradeView
          key={t.id}
          trade={t}
          xe={xOfTime(t.entryTime)}
          xRight={(() => {
            const xe = xOfTime(t.entryTime);
            if (xe == null) return null;
            // End the box at the SL/TP exit candle; while still open, extend it
            // to the current (frontier) candle instead of a fixed-width stub.
            const exitIdx = tradeExitIdx.get(t.id) ?? null;
            const endIdx = exitIdx != null ? exitIdx : frontier >= 0 ? frontier : null;
            const xEnd = endIdx != null ? xOfTime(bars[endIdx]?.time ?? NaN) : null;
            return xEnd != null ? Math.max(xEnd, xe) : xe + FWD_PX;
          })()}
          ye={yOfPrice(t.entryPrice)}
          ysl={yOfPrice(t.sl)}
          ytp={yOfPrice(t.tp)}
          precision={precision}
          pipSize={t.pipSize ?? pipSizeFor(precision)}
          selected={selection?.kind === "trade" && selection.id === t.id}
          hovered={hoverId === t.id}
          touch={touch}
          editLevel={editLevel?.id === t.id ? editLevel.part : null}
          chartW={svgW}
          paneW={paneW}
          preview={false}
          onSelectBody={(e) => {
            if (tool !== "cursor") return;
            select({ kind: "trade", id: t.id });
            startObjDrag(e, { kind: "trade", id: t.id, part: "body" });
          }}
          onHandle={(part, e) => {
            if (tool !== "cursor") return;
            select({ kind: "trade", id: t.id });
            startObjDrag(e, { kind: "trade", id: t.id, part });
          }}
          onHover={(h) => setHoverId((cur) => (h ? t.id : cur === t.id ? null : cur))}
        />
      ))}

      {/* live trade preview */}
      {draftTrade && (
        <TradeView
          trade={draftTrade}
          xe={xOfTime(draftTrade.entryTime)}
          xRight={(() => {
            const xe = xOfTime(draftTrade.entryTime);
            const xc = draft ? xOfTime(draft.end.time) : null;
            if (xe == null) return null;
            return xc != null && xc > xe ? xc : xe + FWD_PX;
          })()}
          ye={yOfPrice(draftTrade.entryPrice)}
          ysl={yOfPrice(draftTrade.sl)}
          ytp={yOfPrice(draftTrade.tp)}
          precision={precision}
          pipSize={draftTrade.pipSize ?? pipSizeFor(precision)}
          selected
          hovered={false}
          touch={touch}
          editLevel={null}
          chartW={svgW}
          paneW={paneW}
          preview
          onSelectBody={() => {}}
          onHandle={() => {}}
          onHover={() => {}}
        />
      )}

      {/* current-candle time, pinned on the x-axis strip */}
      {xFrontier != null && frontierTime != null && svgH > 0 && axisH > 0 && (
        <AxisTimeTag x={xFrontier} cy={svgH - axisH / 2} label={formatTime(frontierTime)} />
      )}
    </svg>
  );
}

/** A blue time label on the bottom axis marking the current (frontier) candle. */
function AxisTimeTag({ x, cy, label }: { x: number; cy: number; label: string }) {
  const w = label.length * 6.1 + 12;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={x - w / 2} y={cy - 8} width={w} height={16} rx={3} fill="#3b82f6" />
      <text x={x} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#ffffff">
        {label}
      </text>
    </g>
  );
}

// ---------- helpers ----------

/** Build a Trade from a draft: start = entry, end.price = target → SL via reward:risk. */
function tradeFromDraft(d: Draft, rr: number, entryIdx: number): Trade | null {
  if (d.tool === "trendline") return null;
  const direction: TradeDirection = d.tool;
  const entry = d.start.price;
  const dist = Math.abs(d.end.price - entry);
  if (dist <= 0) {
    // not dragged yet — show a default-sized box so there's instant feedback
    const fallback = entry * 0.005;
    const tp = direction === "long" ? entry + fallback : entry - fallback;
    const sl = direction === "long" ? entry - fallback / rr : entry + fallback / rr;
    return mkTrade(direction, d.start, entryIdx, sl, tp);
  }
  const tp = direction === "long" ? entry + dist : entry - dist;
  const risk = dist / Math.max(rr, 0.1);
  const sl = direction === "long" ? entry - risk : entry + risk;
  return mkTrade(direction, d.start, entryIdx, sl, tp);
}

function mkTrade(direction: TradeDirection, entry: Anchor, entryIdx: number, sl: number, tp: number): Trade {
  return {
    id: makeTradeId(),
    direction,
    entryTime: entry.time,
    entryBarIndex: entryIdx,
    entryPrice: entry.price,
    sl,
    tp,
    createdAt: Date.now(),
    ...tradeContext(),
  };
}

// ---------- sub-views ----------

function TrendlineView(props: {
  tl: Trendline;
  xa: number | null;
  ya: number | null;
  xb: number | null;
  yb: number | null;
  selected: boolean;
  onSelectBody: (e: React.PointerEvent) => void;
  onHandle: (part: "a" | "b", e: React.PointerEvent) => void;
}) {
  const { tl, xa, ya, xb, yb, selected } = props;
  if (xa == null || ya == null || xb == null || yb == null) return null;
  const proj = projectLine(xa, ya, xb, yb, tl.extend);
  return (
    <g>
      {/* hit area follows the actual a–b segment */}
      <line x1={xa} y1={ya} x2={xb} y2={yb} stroke="transparent" strokeWidth={12} style={{ pointerEvents: "stroke", cursor: "move" }} onPointerDown={props.onSelectBody} />
      {/* visible line (projected if extend is set) */}
      <line x1={proj.x1} y1={proj.y1} x2={proj.x2} y2={proj.y2} stroke={tl.color} strokeWidth={selected ? tl.width + 1 : tl.width} strokeDasharray={DASH[tl.style]} style={{ pointerEvents: "none" }} />
      {selected &&
        ([
          { p: "a" as const, x: xa, y: ya },
          { p: "b" as const, x: xb, y: yb },
        ]).map((h) => (
          <circle key={h.p} cx={h.x} cy={h.y} r={HANDLE_R + 1} fill="#0e1116" stroke={tl.color} strokeWidth={2} style={{ pointerEvents: "all", cursor: "grab" }} onPointerDown={(e) => props.onHandle(h.p, e)} />
        ))}
    </g>
  );
}

/** Project a segment beyond its endpoints along its slope (TradingView "extend"). */
function projectLine(ax: number, ay: number, bx: number, by: number, dir: "none" | "right" | "both") {
  if (dir === "none") return { x1: ax, y1: ay, x2: bx, y2: by };
  const FAR = 1e5;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = (dx / len) * FAR;
  const uy = (dy / len) * FAR;
  return {
    x1: dir === "both" ? ax - ux : ax,
    y1: dir === "both" ? ay - uy : ay,
    x2: bx + ux,
    y2: by + uy,
  };
}

function DraftLine({ xa, ya, xb, yb }: { xa: number | null; ya: number | null; xb: number | null; yb: number | null }) {
  if (xa == null || ya == null || xb == null || yb == null) return null;
  return <line x1={xa} y1={ya} x2={xb} y2={yb} stroke={DEFAULT_LINE_COLOR} strokeWidth={2} strokeDasharray="5 4" style={{ pointerEvents: "none" }} />;
}

function TradeView(props: {
  trade: Trade;
  xe: number | null;
  xRight: number | null;
  ye: number | null;
  ysl: number | null;
  ytp: number | null;
  precision: number;
  pipSize: number;
  selected: boolean;
  /** Pointer is over the drawing — reveals the drag dots and the info chips. */
  hovered: boolean;
  /** Touch device — enlarge hit targets and treat selection as the reveal trigger. */
  touch: boolean;
  /** Level currently being dragged — draws a full-width line + a live Y-axis price tag. */
  editLevel: "sl" | "tp" | "entry" | null;
  /** Overlay width (right edge) for the full-chart-width editing line. */
  chartW: number;
  /** Chart pane width = left edge of the right price scale, for the Y-axis tag. */
  paneW: number;
  preview: boolean;
  onSelectBody: (e: React.PointerEvent) => void;
  onHandle: (part: "entry" | "sl" | "tp", e: React.PointerEvent) => void;
  onHover: (hovering: boolean) => void;
}) {
  const { trade, xe, xRight, ye, ysl, ytp, precision, pipSize, selected, hovered, touch, editLevel, chartW, paneW, preview } = props;
  if (xe == null || xRight == null || ye == null || ysl == null || ytp == null) return null;

  const color = trade.direction === "long" ? LONG_COLOR : SHORT_COLOR;
  const w = Math.max(8, xRight - xe);
  const risk = Math.abs(trade.entryPrice - trade.sl);
  const rr = risk > 0 ? Math.abs(trade.tp - trade.entryPrice) / risk : 0;
  const pip = pipSize > 0 ? pipSize : 1;
  const tpPips = Math.abs(trade.tp - trade.entryPrice) / pip;
  const slPips = Math.abs(trade.entryPrice - trade.sl) / pip;
  const pips1 = (v: number) => (Math.trunc(v * 10) / 10).toFixed(1);

  const dragging = editLevel != null;
  // Dots are hidden until you interact — tap/select (touch) or hover (desktop).
  const showHandles = !preview && (hovered || selected || dragging);
  // Info chips show only while the position is selected/being adjusted (or
  // hovered on desktop) — not sitting there all the time.
  const showInfo = preview || hovered || selected || dragging;

  // The level being dragged → its y, price, and colour (for the line + axis tag).
  const levelY = editLevel === "sl" ? ysl : editLevel === "tp" ? ytp : editLevel === "entry" ? ye : null;
  const levelPrice = editLevel === "sl" ? trade.sl : editLevel === "tp" ? trade.tp : editLevel === "entry" ? trade.entryPrice : null;
  const levelColor = editLevel === "sl" ? SHORT_COLOR : editLevel === "tp" ? LONG_COLOR : color;

  const hitR = touch ? 26 : 15;
  const dotR = touch ? 9 : 6.6; // 20% larger than before
  const handle = (part: "entry" | "sl" | "tp", cy: number, fill: string) => (
    <g style={{ pointerEvents: "all", cursor: "ns-resize", touchAction: "none" }} onPointerDown={(e) => props.onHandle(part, e)}>
      {/* generous invisible hit area so the dot is easy to grab (esp. touch) */}
      <circle cx={xe} cy={cy} r={hitR} fill="transparent" />
      <circle cx={xe} cy={cy} r={dotR} fill={fill} stroke="#0e1116" strokeWidth={1.5} />
    </g>
  );

  return (
    <g
      opacity={preview ? 0.85 : 1}
      onPointerEnter={preview ? undefined : () => props.onHover(true)}
      onPointerLeave={preview ? undefined : () => props.onHover(false)}
    >
      {/* translucent reward (green) / risk (red) zones */}
      <rect x={xe} y={Math.min(ye, ytp)} width={w} height={Math.abs(ye - ytp)} fill={LONG_COLOR} opacity={0.13} style={{ pointerEvents: "none" }} />
      <rect x={xe} y={Math.min(ye, ysl)} width={w} height={Math.abs(ye - ysl)} fill={SHORT_COLOR} opacity={0.13} style={{ pointerEvents: "none" }} />

      {/* body: hover + tap-to-select + move target. Padded on touch so a small
          box is still easy to tap with a finger. */}
      {!preview &&
        (() => {
          const pad = touch ? 16 : 0;
          return (
            <rect
              x={xe - pad}
              y={Math.min(ytp, ysl) - pad}
              width={w + pad * 2}
              height={Math.abs(ytp - ysl) + pad * 2}
              fill="transparent"
              style={{ pointerEvents: "all", cursor: "move", touchAction: "none" }}
              onPointerDown={props.onSelectBody}
            />
          );
        })()}

      {/* TP / entry / SL level lines (the drawing itself — always shown, no text) */}
      <line x1={xe} y1={ytp} x2={xRight} y2={ytp} stroke={LONG_COLOR} strokeWidth={1} strokeDasharray="5 4" style={{ pointerEvents: "none" }} />
      <line x1={xe} y1={ye} x2={xRight} y2={ye} stroke={color} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
      <line x1={xe} y1={ysl} x2={xRight} y2={ysl} stroke={SHORT_COLOR} strokeWidth={1} strokeDasharray="5 4" style={{ pointerEvents: "none" }} />

      {/* drag dots — entry / TP / SL — revealed on hover (or while selected/dragging) */}
      {showHandles && (
        <>
          {handle("entry", ye, color)}
          {handle("tp", ytp, LONG_COLOR)}
          {handle("sl", ysl, SHORT_COLOR)}
        </>
      )}

      {/* Info chips — anchored just right of the dot column so they never cover
          the entry/SL/TP buttons. Each sits on its own level line. */}
      {showInfo &&
        (() => {
          const xLabel = xe + dotR + 14;
          return (
            <>
              <InfoChip x={xLabel} cy={ysl} fill={SHORT_COLOR} textColor="#ffffff" text={`Stop: ${trade.sl.toFixed(precision)}   ${pips1(slPips)}`} />
              <InfoChip x={xLabel} cy={ye} fill="#ffffff" stroke={SHORT_COLOR} textColor="#0e1116" text={`Risk/reward ratio: ${rr.toFixed(2)}`} />
              <InfoChip x={xLabel} cy={ytp} fill={LONG_COLOR} textColor="#ffffff" text={`Target: ${trade.tp.toFixed(precision)}   ${pips1(tpPips)}`} />
            </>
          );
        })()}

      {/* dragging a level: full-width dotted line + the live price on the Y axis */}
      {dragging && levelY != null && (
        <>
          <line x1={0} y1={levelY} x2={chartW} y2={levelY} stroke={levelColor} strokeWidth={1} strokeDasharray="2 3" style={{ pointerEvents: "none" }} />
          {paneW > 0 && paneW < chartW && levelPrice != null && (
            <PriceAxisTag x0={paneW} x1={chartW} cy={levelY} color={levelColor} label={levelPrice.toFixed(precision)} />
          )}
        </>
      )}
    </g>
  );
}

/** A left-anchored, pill-shaped info chip (stop / risk-reward / target). */
function InfoChip({ x, cy, fill, stroke, textColor, text }: { x: number; cy: number; fill: string; stroke?: string; textColor: string; text: string }) {
  const w = text.length * 6.3 + 18;
  const h = 19;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={x} y={cy - h / 2} width={w} height={h} rx={5} fill={fill} stroke={stroke ?? "none"} strokeWidth={stroke ? 1.5 : 0} opacity={0.96} />
      <text x={x + 9} y={cy + 3.6} textAnchor="start" fontSize={11} fontWeight={700} fill={textColor}>
        {text}
      </text>
    </g>
  );
}

/** Live price label drawn on the right price scale while dragging a level. */
function PriceAxisTag({ x0, x1, cy, color, label }: { x0: number; x1: number; cy: number; color: string; label: string }) {
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={x0} y={cy - 9} width={x1 - x0} height={18} fill={color} />
      <text x={(x0 + x1) / 2} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#ffffff">
        {label}
      </text>
    </g>
  );
}
