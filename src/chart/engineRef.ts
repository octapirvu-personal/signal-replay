import type { ReplayEngine } from "./replayEngine";

/**
 * Module-level handle to the single chart engine. The engine is imperative and
 * lives outside React's render loop; UI code reaches it through here so chart
 * frames never trigger React re-renders.
 */
let engine: ReplayEngine | null = null;

export function setEngine(e: ReplayEngine | null) {
  engine = e;
  // Dev-only handle for debugging/inspection in the console.
  if (import.meta.env.DEV) (window as unknown as { __engine: ReplayEngine | null }).__engine = e;
}
export function getEngine(): ReplayEngine | null {
  return engine;
}
