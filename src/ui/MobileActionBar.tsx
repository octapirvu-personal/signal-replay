import { useApp } from "../state/app";
import { nextSignal, prevSignal } from "../app/controls";

/**
 * Bottom navigation for touch devices: step backward / forward through signals
 * (the same animated transition either way). Hidden on `md`+.
 */
export function MobileActionBar() {
  const hasDataset = useApp((s) => s.datasetId != null);
  const cur = useApp((s) => s.cur);
  const count = useApp((s) => s.signals.length);
  if (!hasDataset) return null;

  return (
    <div className="flex gap-2 border-t border-line bg-panel px-3 py-2 md:hidden">
      <Btn onClick={prevSignal} disabled={cur <= 0} label="◀ Back" />
      <Btn onClick={nextSignal} disabled={cur >= count - 1} label="Forward ▶" />
    </div>
  );
}

function Btn({ onClick, label, disabled }: { onClick: () => void; label: string; disabled: boolean }) {
  return (
    <button
      className="flex-1 rounded-md border border-line bg-panel2 py-2.5 text-sm font-medium text-ink active:bg-accent active:text-white disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
