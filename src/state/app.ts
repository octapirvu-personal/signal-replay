import { create } from "zustand";
import type { Bar, ColumnMap, SignalFlags } from "../data/types";
import type { Bands, Signal } from "../signals/types";

export type DecisionKind = "take" | "skip";
export interface DecisionRecord {
  decision: DecisionKind;
  note?: string;
  rating?: string;
}

/** Pending column-mapping state when auto-detection was not confident. */
export interface MappingState {
  headers: string[];
  rows: string[][];
  map: ColumnMap;
  message: string;
}

interface AppStore {
  // dataset
  datasetId: string | null;
  datasetName: string;
  bars: Bar[];
  csvFlags: SignalFlags[] | null;
  hasCsvSignals: boolean;
  /** Decimal precision for price display, auto-detected from the dataset. */
  pricePrecision: number;

  // signals
  computed: Signal[];
  fileSigs: Signal[];
  signals: Signal[]; // the active set being stepped through
  bands: Bands | null;

  // replay position
  cur: number; // index into signals
  reveal: number; // bars revealed past the current signal
  frontier: number; // last revealed bar index in the current replay (-1 = none)

  // journaling — keyed by signal time so it survives recompute & reload
  decisions: Record<number, DecisionRecord>;

  // mapping bar
  mapping: MappingState | null;

  // actions
  loadDataset(p: {
    id: string;
    name: string;
    bars: Bar[];
    csvFlags: SignalFlags[] | null;
    hasCsvSignals: boolean;
  }): void;
  setSignals(p: { computed: Signal[]; fileSigs: Signal[]; active: Signal[]; bands: Bands | null }): void;
  setActive(active: Signal[]): void;
  setPricePrecision(p: number): void;
  setCur(cur: number): void;
  setReveal(reveal: number): void;
  setFrontier(frontier: number): void;
  setDecision(signalTime: number, rec: DecisionRecord | null): void;
  hydrateDecisions(d: Record<number, DecisionRecord>): void;
  setMapping(m: MappingState | null): void;
  reset(): void;
}

export const useApp = create<AppStore>((set) => ({
  datasetId: null,
  datasetName: "",
  bars: [],
  csvFlags: null,
  hasCsvSignals: false,
  pricePrecision: 2,
  computed: [],
  fileSigs: [],
  signals: [],
  bands: null,
  cur: 0,
  reveal: 0,
  frontier: -1,
  decisions: {},
  mapping: null,

  loadDataset: (p) =>
    set({
      datasetId: p.id,
      datasetName: p.name,
      bars: p.bars,
      csvFlags: p.csvFlags,
      hasCsvSignals: p.hasCsvSignals,
      mapping: null,
      cur: 0,
      reveal: 0,
    }),
  setSignals: (p) => set({ computed: p.computed, fileSigs: p.fileSigs, signals: p.active, bands: p.bands }),
  setActive: (active) => set({ signals: active, cur: 0, reveal: 0 }),
  setPricePrecision: (p) => set({ pricePrecision: p }),
  setCur: (cur) => set({ cur }),
  setReveal: (reveal) => set({ reveal }),
  setFrontier: (frontier) => set({ frontier }),
  setDecision: (signalTime, rec) =>
    set((s) => {
      const next = { ...s.decisions };
      if (rec) next[signalTime] = rec;
      else delete next[signalTime];
      return { decisions: next };
    }),
  hydrateDecisions: (d) => set({ decisions: d }),
  setMapping: (m) => set({ mapping: m }),
  reset: () =>
    set({
      datasetId: null,
      datasetName: "",
      bars: [],
      csvFlags: null,
      hasCsvSignals: false,
      pricePrecision: 2,
      computed: [],
      fileSigs: [],
      signals: [],
      bands: null,
      cur: 0,
      reveal: 0,
      frontier: -1,
      decisions: {},
      mapping: null,
    }),
}));
