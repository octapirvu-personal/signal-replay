import { create } from "zustand";
import type { DrawTool, Selection, Trendline } from "../drawings/types";
import type { Trade } from "../backtest/trades";
import { kvGet, kvSet } from "../persistence/db";

interface DrawingsStore {
  tool: DrawTool;
  trendlines: Trendline[];
  trades: Trade[];
  selection: Selection;
  datasetId: string | null;

  setTool(t: DrawTool): void;
  select(sel: Selection): void;

  addTrendline(t: Trendline): void;
  updateTrendline(id: string, patch: Partial<Trendline>): void;
  removeTrendline(id: string): void;

  addTrade(t: Trade): void;
  updateTrade(id: string, patch: Partial<Trade>): void;
  removeTrade(id: string): void;

  deleteSelected(): void;
  clearAll(): void;

  hydrate(datasetId: string): Promise<void>;
}

const key = (id: string) => `drawings:${id}`;

export const useDrawings = create<DrawingsStore>((set, get) => ({
  tool: "cursor",
  trendlines: [],
  trades: [],
  selection: null,
  datasetId: null,

  setTool: (t) => set({ tool: t, selection: t === "cursor" ? get().selection : null }),
  select: (sel) => set({ selection: sel }),

  addTrendline: (t) => {
    set((s) => ({ trendlines: [...s.trendlines, t] }));
    persist(get);
  },
  updateTrendline: (id, patch) => {
    set((s) => ({ trendlines: s.trendlines.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
    persist(get);
  },
  removeTrendline: (id) => {
    set((s) => ({
      trendlines: s.trendlines.filter((d) => d.id !== id),
      selection: s.selection?.kind === "trendline" && s.selection.id === id ? null : s.selection,
    }));
    persist(get);
  },

  addTrade: (t) => {
    set((s) => ({ trades: [...s.trades, t] }));
    persist(get);
  },
  updateTrade: (id, patch) => {
    set((s) => ({ trades: s.trades.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
    persist(get);
  },
  removeTrade: (id) => {
    set((s) => ({
      trades: s.trades.filter((d) => d.id !== id),
      selection: s.selection?.kind === "trade" && s.selection.id === id ? null : s.selection,
    }));
    persist(get);
  },

  deleteSelected: () => {
    const sel = get().selection;
    if (!sel) return;
    if (sel.kind === "trendline") get().removeTrendline(sel.id);
    else get().removeTrade(sel.id);
  },

  clearAll: () => {
    set({ trendlines: [], trades: [], selection: null });
    persist(get);
  },

  hydrate: async (datasetId) => {
    // flush any pending writes for the dataset we're leaving so a fast switch
    // can't drop the previous dataset's drawings.
    flushDrawings();
    const snap = await kvGet<{ trendlines: Trendline[]; trades: Trade[] }>(key(datasetId));
    set({
      datasetId,
      trendlines: snap?.trendlines ?? [],
      trades: snap?.trades ?? [],
      selection: null,
      tool: "cursor",
    });
  },
}));

let timer: ReturnType<typeof setTimeout> | null = null;
function persist(get: () => DrawingsStore) {
  if (!get().datasetId) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushDrawings, 150);
}

/** Write the current drawings/trades to IndexedDB immediately (cancels any debounce). */
export function flushDrawings() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const s = useDrawings.getState();
  if (!s.datasetId) return;
  void kvSet(key(s.datasetId), { trendlines: s.trendlines, trades: s.trades });
}

// Persist immediately when the tab is hidden or the page is being unloaded
// (refresh / close), so the 150ms debounce can never lose a just-made change.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushDrawings);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushDrawings();
  });
}
