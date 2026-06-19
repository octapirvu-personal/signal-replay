import { useApp } from "../state/app";
import { useSettings } from "../state/settings";
import { useDrawings } from "../state/drawings";
import type { DrawTool } from "../drawings/types";
import { tradeFromCurrentSignal, tradeAtFrontier } from "../app/drawingControls";

const TOOLS: { id: DrawTool; label: string; key: string; title: string }[] = [
  { id: "cursor", label: "↖", key: "1", title: "Select / move (1, Esc)" },
  { id: "trendline", label: "╱", key: "2", title: "Trendline (2)" },
  { id: "long", label: "▲", key: "3", title: "Long — plot at the current candle (3)" },
  { id: "short", label: "▼", key: "4", title: "Short — plot at the current candle (4)" },
];

export function DrawToolbar() {
  const tool = useDrawings((s) => s.tool);
  const setTool = useDrawings((s) => s.setTool);
  const clearAll = useDrawings((s) => s.clearAll);
  const hasSignals = useApp((s) => s.signals.length > 0);
  const magnet = useSettings((s) => s.magnet);
  const setSetting = useSettings((s) => s.set);

  return (
    <div className="flex w-11 flex-col items-center gap-1.5 border-r border-line bg-panel py-2">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.title}
          className={`flex h-8 w-8 items-center justify-center rounded-md border text-[15px] ${
            tool === t.id ? "border-accent bg-accent text-white" : "border-line bg-panel2 text-ink hover:border-accent"
          } ${t.id === "long" ? "!text-buy" : ""} ${t.id === "short" ? "!text-sell" : ""} ${tool === t.id ? "!text-white" : ""}`}
          onClick={() => {
            if (t.id === "long" || t.id === "short") tradeAtFrontier(t.id);
            else setTool(t.id);
          }}
        >
          {t.label}
        </button>
      ))}

      <div className="my-1 h-px w-6 bg-line" />

      <button
        title={`Magnet: snap to OHLC — ${magnet ? "on" : "off"}`}
        className={`flex h-8 w-8 items-center justify-center rounded-md border text-[15px] ${
          magnet ? "border-accent bg-accent text-white" : "border-line bg-panel2 text-ink hover:border-accent"
        }`}
        onClick={() => setSetting("magnet", !magnet)}
      >
        🧲
      </button>

      <button
        title="Journal a trade on the current signal (E)"
        disabled={!hasSignals}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-panel2 text-[13px] text-accent hover:border-accent disabled:opacity-40"
        onClick={() => tradeFromCurrentSignal()}
      >
        ⚡
      </button>

      <div className="flex-1" />

      <button
        title="Clear all drawings & trades"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-panel2 text-[13px] text-muted hover:border-sell hover:text-sell"
        onClick={() => {
          if (confirm("Clear all drawings and trades for this dataset?")) clearAll();
        }}
      >
        🗑
      </button>
    </div>
  );
}
