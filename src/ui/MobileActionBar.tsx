import { useApp } from "../state/app";
import { useDrawings } from "../state/drawings";
import { useSettings } from "../state/settings";
import { navForward, navBack } from "../app/controls";
import { DatasetSwitcher } from "./DatasetSwitcher";

/**
 * The entire mobile control surface, in one bottom row: symbol picker, signal
 * back/forward, journal — plus a collapse toggle to hand the chart the whole
 * screen. The desktop top bar is hidden on mobile in favour of this.
 */
export function MobileActionBar({ onOpenJournal, onCollapse }: { onOpenJournal: () => void; onCollapse: () => void }) {
  const hasDataset = useApp((s) => s.datasetId != null);
  const cur = useApp((s) => s.cur);
  const count = useApp((s) => s.signals.length);
  const reveal = useApp((s) => s.reveal);
  const maxReveal = useApp((s) => Math.max(0, s.bars.length - 1 - (s.signals[s.cur]?.barIndex ?? 0)));
  const hasSelection = useDrawings((s) => s.selection != null);
  const stepMode = useSettings((s) => s.stepMode);
  if (!hasDataset) return null;

  // In step mode, bounds follow revealed candles; otherwise the signal index.
  const backDisabled = stepMode ? reveal <= 0 : cur <= 0;
  const fwdDisabled = stepMode ? reveal >= maxReveal : cur >= count - 1;

  return (
    <div className="flex items-center gap-1.5 border-t border-line bg-panel px-2 py-1.5" style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}>
      <DatasetSwitcher compact />
      <Btn onClick={navBack} disabled={backDisabled} label="◀" wide />
      <Btn onClick={navForward} disabled={fwdDisabled} label="▶" wide />
      {/* Toggle: candle-by-candle stepping (skips 00:00–07:30) vs jump-to-signal. */}
      <Btn
        onClick={() => useSettings.getState().set("stepMode", !stepMode)}
        label="STEP"
        title="Step candle-by-candle (skips 00:00–07:30)"
        active={stepMode}
      />
      {/* Deselect / unstick: clears the selection and frees a stuck move tool. */}
      <Btn onClick={() => window.dispatchEvent(new Event("reset-draw"))} label="↖" title="Deselect / reset" active={hasSelection} />
      <Btn onClick={onOpenJournal} label="📓" />
      <Btn onClick={onCollapse} label="⌄" title="Hide bar" />
    </div>
  );
}

function Btn({ onClick, label, disabled, wide, title, active }: { onClick: () => void; label: string; disabled?: boolean; wide?: boolean; title?: string; active?: boolean }) {
  return (
    <button
      className={`${wide ? "flex-1" : ""} rounded-md border px-3 py-2.5 text-sm font-medium active:bg-accent active:text-white disabled:opacity-40 ${
        active ? "border-accent bg-accent text-white" : "border-line bg-panel2 text-ink"
      }`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
