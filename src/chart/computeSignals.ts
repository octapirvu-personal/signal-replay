import type { Bar, SignalFlags } from "../data/types";
import { getStrategy, fileSignals } from "../signals";
import type { Bands, Signal } from "../signals/types";
import type { Settings } from "../state/settings";

export interface ComputedSignals {
  computed: Signal[];
  fileSigs: Signal[];
  active: Signal[];
  bands: Bands | null;
}

/** Run the configured strategy and resolve which signal set is active. */
export function computeSignals(
  bars: Bar[],
  csvFlags: SignalFlags[] | null,
  hasCsvSignals: boolean,
  settings: Pick<Settings, "strategyId" | "strategyParams" | "sigSource">,
): ComputedSignals {
  const strategy = getStrategy(settings.strategyId);
  const out = strategy.compute(bars, settings.strategyParams);
  const computed = out.signals;
  const fileSigs = hasCsvSignals ? fileSignals(bars, csvFlags) : [];

  let src = settings.sigSource;
  if (src === "file" && !hasCsvSignals) src = "compute";
  if (src === "auto") src = hasCsvSignals ? "file" : "compute";

  const active = src === "file" ? fileSigs : computed;
  return { computed, fileSigs, active, bands: out.bands ?? null };
}
