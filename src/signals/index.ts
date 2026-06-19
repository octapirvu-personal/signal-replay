import { bbReEntryStrategy } from "./bbReentry";
import type { Strategy } from "./types";

export * from "./types";
export * from "./bbReentry";
export * from "./fileSignals";

/** Registry of available strategies. Add new strategies here. */
export const STRATEGIES: Strategy[] = [bbReEntryStrategy];

export function getStrategy(id: string): Strategy {
  return STRATEGIES.find((s) => s.id === id) ?? bbReEntryStrategy;
}

/** Default parameter values for a strategy, keyed by param. */
export function defaultParams(strategy: Strategy): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of strategy.params) out[p.key] = p.default;
  return out;
}
