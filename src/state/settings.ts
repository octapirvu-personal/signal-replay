import { create } from "zustand";
import { kvGet, kvSet } from "../persistence/db";

/** User-tunable, persisted settings. */
export interface Settings {
  /** Default number of bars visible — used to derive initial barSpacing. */
  lookback: number;
  /** Persisted zoom. Restored on load; only changed by the user (wheel/pinch). */
  barSpacing: number;
  /** Bars revealed per ↑ / Space. */
  revealStep: number;
  /** Auto-scroll to keep the frontier in view on navigation. */
  followFrontier: boolean;
  /** Where the frontier lands across the viewport when following (0..1). */
  anchor: number;
  /** Smooth streaming reveal on landing. */
  animate: boolean;
  /** Reveal/scroll animation duration (ms). */
  animMs: number;
  /** Snap drawing anchors to nearest O/H/L/C. */
  magnet: boolean;
  /** Draw the strategy's Bollinger bands. */
  showBands: boolean;
  /** Draw the Triple EMA (9 / 20 / 50) overlay. */
  showEma: boolean;
  /** Signal source preference. */
  sigSource: "auto" | "file" | "compute";
  /** Strategy id + params. */
  strategyId: string;
  strategyParams: Record<string, number>;
  /** Trade tool: default risk as % of entry, and reward:risk for one-click trades. */
  tradeRiskPct: number;
  tradeRR: number;
  /** Journal: default position size and account-currency value per pip (per 1.0 size). */
  positionSize: number;
  pipValue: number;
  /** Stats: forward-bar horizon for take-decision outcomes. */
  statHorizon: number;
  /** Show the right-hand sidebar (notes / signals / trades / performance). */
  showSidebar: boolean;
  /** Bottom-bar nav steps candle-by-candle (skipping 22:00–07:30) instead of jumping to signals. */
  stepMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lookback: 120,
  barSpacing: 8,
  revealStep: 10,
  followFrontier: true,
  anchor: 0.75,
  animate: true,
  animMs: 420,
  magnet: false,
  showBands: true,
  showEma: false,
  sigSource: "auto",
  strategyId: "bb-reentry",
  strategyParams: { length: 20, mult: 2 },
  tradeRiskPct: 1,
  tradeRR: 3,
  positionSize: 1,
  pipValue: 10,
  statHorizon: 20,
  showSidebar: true,
  stepMode: false,
};

interface SettingsStore extends Settings {
  hydrated: boolean;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  setParam(key: string, value: number): void;
  hydrate(): Promise<void>;
}

const KV_KEY = "settings";

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,

  set(key, value) {
    set({ [key]: value } as Pick<Settings, typeof key>);
    persist(get);
  },
  setParam(key, value) {
    set({ strategyParams: { ...get().strategyParams, [key]: value } });
    persist(get);
  },
  async hydrate() {
    const stored = await kvGet<Partial<Settings>>(KV_KEY);
    const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
    // one-time: lift the old 2:1 default reward:risk to the new 3:1 default for
    // existing users (there was never UI to set 2 deliberately).
    const rrBumped = await kvGet<boolean>("rrDefault3");
    if (!rrBumped) {
      if (merged.tradeRR === 2) merged.tradeRR = 3;
      void kvSet("rrDefault3", true);
    }
    set({ ...merged, hydrated: true });
  },
}));

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist(get: () => SettingsStore) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => flushSettings(get), 200);
}

/** Snapshot and write settings immediately (cancels any debounce). */
export function flushSettings(get: () => SettingsStore = useSettings.getState) {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const s = get();
  if (!s.hydrated) return; // never overwrite stored settings before they load
  const snapshot: Settings = {
    lookback: s.lookback,
    barSpacing: s.barSpacing,
    revealStep: s.revealStep,
    followFrontier: s.followFrontier,
    anchor: s.anchor,
    animate: s.animate,
    animMs: s.animMs,
    magnet: s.magnet,
    showBands: s.showBands,
    showEma: s.showEma,
    sigSource: s.sigSource,
    strategyId: s.strategyId,
    strategyParams: s.strategyParams,
    tradeRiskPct: s.tradeRiskPct,
    tradeRR: s.tradeRR,
    positionSize: s.positionSize,
    pipValue: s.pipValue,
    statHorizon: s.statHorizon,
    showSidebar: s.showSidebar,
    stepMode: s.stepMode,
  };
  void kvSet(KV_KEY, snapshot);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => flushSettings());
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSettings();
  });
}
