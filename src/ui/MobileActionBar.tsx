import { useApp } from "../state/app";
import { useSettings } from "../state/settings";
import { nextSignal, prevSignal, revealMore, hideSome, decide } from "../app/controls";

/**
 * Bottom action bar for touch devices — the core replay loop that's keyboard-only
 * on desktop (prev/next signal, reveal more/less, take/skip). Hidden on `md`+.
 */
export function MobileActionBar() {
  const hasDataset = useApp((s) => s.datasetId != null);
  const step = useSettings((s) => Math.max(1, s.revealStep));
  if (!hasDataset) return null;

  return (
    <div className="flex gap-1.5 border-t border-line bg-panel px-2 py-1.5 md:hidden">
      <Btn onClick={prevSignal} label="◀ Sig" />
      <Btn onClick={() => hideSome(step)} label="− Hide" />
      <Btn onClick={() => revealMore(step)} label="+ Reveal" />
      <Btn onClick={() => decide("skip")} label="Skip" tone="sell" />
      <Btn onClick={() => decide("take")} label="Take" tone="buy" />
      <Btn onClick={nextSignal} label="Sig ▶" />
    </div>
  );
}

function Btn({ onClick, label, tone }: { onClick: () => void; label: string; tone?: "buy" | "sell" }) {
  const toneCls = tone === "buy" ? "border-buy/50 text-buy" : tone === "sell" ? "border-sell/50 text-sell" : "border-line text-ink";
  return (
    <button className={`flex-1 rounded-md border bg-panel2 py-2 text-[13px] font-medium active:bg-accent active:text-white ${toneCls}`} onClick={onClick}>
      {label}
    </button>
  );
}
