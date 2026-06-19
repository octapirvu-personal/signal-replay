import { useApp } from "../state/app";
import { useSettings } from "../state/settings";
import { useDrawings } from "../state/drawings";
import { getEngine } from "../chart/engineRef";
import { defaultLevels, type Trade, type TradeDirection } from "../backtest/trades";
import { pipSizeFor } from "../backtest/journal";

/**
 * Snapshot the instrument + sizing context at the moment a trade is placed, so
 * each journal entry stays stable even if settings/dataset change later.
 */
export function tradeContext(): Pick<Trade, "symbol" | "size" | "pipSize" | "pipValue"> {
  const app = useApp.getState();
  const s = useSettings.getState();
  return {
    symbol: app.datasetName || "—",
    size: s.positionSize,
    pipSize: pipSizeFor(app.pricePrecision),
    pipValue: s.pipValue,
  };
}

let counter = 0;
/** Monotonic id (no Math.random — keeps things deterministic enough and SSR-safe). */
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export function makeTradeId() {
  return newId("trade");
}
export function makeTrendlineId() {
  return newId("tl");
}

/**
 * Create a trade at a given entry bar/price (the fast path used by the trade
 * tool's single click). SL/TP default from settings; the user drags to adjust.
 */
export function createTrade(direction: TradeDirection, entryBarIndex: number, entryPrice: number) {
  const app = useApp.getState();
  const bar = app.bars[entryBarIndex];
  if (!bar) return null;
  const s = useSettings.getState();
  const { sl, tp } = defaultLevels(direction, entryPrice, s.tradeRiskPct, s.tradeRR);
  const trade: Trade = {
    id: makeTradeId(),
    direction,
    entryTime: bar.time,
    entryBarIndex,
    entryPrice,
    sl,
    tp,
    createdAt: Date.now(),
    ...tradeContext(),
  };
  useDrawings.getState().addTrade(trade);
  useDrawings.getState().select({ kind: "trade", id: trade.id });
  return trade;
}

/**
 * Instant trade at the candle currently in view (the replay frontier): entry at
 * its close, SL at that candle's low (long) / high (short), TP from the R:R
 * setting. One keypress (3 = long, 4 = short) drops a ready-to-tweak trade.
 */
export function tradeAtFrontier(direction: TradeDirection) {
  const app = useApp.getState();
  if (!app.bars.length) return null;
  const eng = getEngine();
  const f = eng ? eng.getFrontier() : -1;
  const idx = f >= 0 && f < app.bars.length ? f : app.bars.length - 1;
  const bar = app.bars[idx];
  if (!bar) return null;

  const s = useSettings.getState();
  const entry = bar.close;
  let sl = direction === "long" ? bar.low : bar.high;
  const risk = Math.abs(entry - sl);
  let tp: number;
  if (risk > 1e-12) {
    tp = direction === "long" ? entry + risk * s.tradeRR : entry - risk * s.tradeRR;
  } else {
    // degenerate candle (close == low/high): fall back to the %-risk default
    const lv = defaultLevels(direction, entry, s.tradeRiskPct, s.tradeRR);
    sl = lv.sl;
    tp = lv.tp;
  }

  const trade: Trade = {
    id: makeTradeId(),
    direction,
    entryTime: bar.time,
    entryBarIndex: idx,
    entryPrice: entry,
    sl,
    tp,
    createdAt: Date.now(),
    ...tradeContext(),
  };
  useDrawings.getState().addTrade(trade);
  useDrawings.getState().select({ kind: "trade", id: trade.id });
  return trade;
}

/**
 * The killer fast-journaling action: drop a trade on the CURRENT signal, with
 * direction matching the signal, entry at the signal close. One keypress/click.
 */
export function tradeFromCurrentSignal() {
  const app = useApp.getState();
  const sig = app.signals[app.cur];
  if (!sig) return null;
  return createTrade(sig.type === "buy" ? "long" : "short", sig.barIndex, sig.price);
}
