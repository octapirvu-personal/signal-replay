import { useApp } from "../state/app";
import { nextSignal, prevSignal } from "../app/controls";
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
  if (!hasDataset) return null;

  return (
    <div className="flex items-center gap-1.5 border-t border-line bg-panel px-2 py-1.5">
      <DatasetSwitcher compact />
      <Btn onClick={prevSignal} disabled={cur <= 0} label="◀" wide />
      <Btn onClick={nextSignal} disabled={cur >= count - 1} label="▶" wide />
      <Btn onClick={onOpenJournal} label="📓" />
      <Btn onClick={onCollapse} label="⌄" title="Hide bar" />
    </div>
  );
}

function Btn({ onClick, label, disabled, wide, title }: { onClick: () => void; label: string; disabled?: boolean; wide?: boolean; title?: string }) {
  return (
    <button
      className={`${wide ? "flex-1" : ""} rounded-md border border-line bg-panel2 px-3 py-2.5 text-sm font-medium text-ink active:bg-accent active:text-white disabled:opacity-40`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
