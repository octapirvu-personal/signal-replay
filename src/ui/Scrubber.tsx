import { useRef } from "react";
import { useApp } from "../state/app";
import { formatTime } from "../data/time";
import { gotoSignal } from "../app/controls";

/**
 * Position scrubber across the dataset with signal ticks. Clicking/dragging
 * jumps to the nearest signal. The filled portion reflects the current frontier.
 */
export function Scrubber() {
  const { bars, signals, cur } = useApp();
  const storeFrontier = useApp((s) => s.frontier);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  if (!bars.length) {
    return <div className="flex h-9 items-center border-t border-line bg-panel px-4 text-xs text-muted">—</div>;
  }

  const N = bars.length;
  // the candle currently in view (the replay frontier)
  const frontier = Math.max(0, Math.min(storeFrontier, N - 1));
  const frac = N > 1 ? frontier / (N - 1) : 0;
  const currentTime = bars[frontier]?.time;

  function jumpFromClientX(clientX: number) {
    const el = trackRef.current;
    if (!el || !signals.length) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const targetIndex = x * (N - 1);
    // nearest signal by barIndex
    let best = 0;
    let bestD = Infinity;
    signals.forEach((s, i) => {
      const d = Math.abs(s.barIndex - targetIndex);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    gotoSignal(best);
  }

  return (
    <div className="flex h-9 items-center gap-3 border-t border-line bg-panel px-4">
      <span className="w-24 shrink-0 text-[11px] text-muted">
        bar {frontier + 1} / {N}
      </span>
      <div
        ref={trackRef}
        className="relative h-2 flex-1 cursor-pointer rounded-full bg-panel2"
        onMouseDown={(e) => {
          dragging.current = true;
          jumpFromClientX(e.clientX);
        }}
        onMouseMove={(e) => dragging.current && jumpFromClientX(e.clientX)}
        onMouseUp={() => (dragging.current = false)}
        onMouseLeave={() => (dragging.current = false)}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent/40" style={{ width: `${frac * 100}%` }} />
        {signals.map((s, i) => (
          <span
            key={`${s.barIndex}-${s.type}`}
            title={`#${i + 1} ${s.type}`}
            className={`absolute top-1/2 h-3 w-[2px] -translate-y-1/2 ${s.type === "buy" ? "bg-buy" : "bg-sell"} ${
              i === cur ? "h-4 w-[3px]" : ""
            }`}
            style={{ left: `${(s.barIndex / (N - 1)) * 100}%` }}
          />
        ))}
        <span
          className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-ink"
          style={{ left: `${frac * 100}%` }}
        />
      </div>
      <span
        className="w-40 shrink-0 text-right text-[12px] tabular-nums text-ink"
        title="Time of the current candle"
      >
        🕒 {currentTime != null ? formatTime(currentTime) : "—"}
      </span>
    </div>
  );
}
