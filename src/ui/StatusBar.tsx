import { useApp } from "../state/app";
import { formatTime } from "../data/time";
import { decide, nextSignal, prevSignal } from "../app/controls";

export function StatusBar() {
  const { signals, cur, reveal, bars, decisions } = useApp();
  const sg = signals[cur];

  if (!sg) {
    return (
      <div className="flex min-h-[44px] items-center gap-5 border-b border-line bg-panel2 px-4 py-2 text-[13px]">
        <span className="text-muted">No signals — load a dataset.</span>
      </div>
    );
  }

  const end = Math.min(bars.length - 1, sg.barIndex + reveal);
  let move: { txt: string; pos: boolean } | null = null;
  if (reveal > 0 && end > sg.barIndex) {
    const now = bars[end].close;
    const pct = ((now - sg.price) / sg.price) * 100;
    const fav = sg.type === "buy" ? pct : -pct;
    move = { txt: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% (${fav >= 0 ? "in favor" : "against"})`, pos: fav >= 0 };
  }

  const d = decisions[sg.time];

  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-5 border-b border-line bg-panel2 px-4 py-2 text-[13px]">
      <Stat k="Signal">
        {cur + 1} / {signals.length}
      </Stat>
      <Stat k="Type">
        <span className={`pill ${sg.type === "buy" ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell"}`}>
          {sg.type.toUpperCase()}
        </span>
      </Stat>
      <Stat k="Date / time">{formatTime(sg.time)}</Stat>
      <Stat k="Close">{sg.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</Stat>
      <Stat k="Revealed">{reveal} bars</Stat>
      <Stat k="Since signal">
        {move ? <span className={move.pos ? "text-buy" : "text-sell"}>{move.txt}</span> : "—"}
      </Stat>

      <div className="flex-1" />

      <Stat k="Decision">
        {d ? (
          <span className={d.decision === "take" ? "text-buy" : "text-sell"}>
            {d.decision === "take" ? "✓ Take" : "✗ Skip"}
          </span>
        ) : (
          "—"
        )}
      </Stat>
      <button className="btn !border-buy !text-buy" onClick={() => decide("take")}>
        ✓ Take (T)
      </button>
      <button className="btn !border-sell !text-sell" onClick={() => decide("skip")}>
        ✗ Skip (K)
      </button>
      <button className="btn" disabled={cur === 0} onClick={() => prevSignal()}>
        ◀ Prev
      </button>
      <button className="btn" disabled={cur === signals.length - 1} onClick={() => nextSignal()}>
        Next ▶
      </button>
    </div>
  );
}

function Stat({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="stat-k">{k}</span>
      <span className="stat-v">{children}</span>
    </div>
  );
}
