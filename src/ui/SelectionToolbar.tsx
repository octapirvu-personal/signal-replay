import { useDrawings } from "../state/drawings";
import type { ExtendDir, LineStyleName } from "../drawings/types";

const COLORS = ["#f0b429", "#3b82f6", "#26a69a", "#ef5350", "#e6edf3", "#a855f7"];
const EXTEND_NEXT: Record<ExtendDir, ExtendDir> = { none: "right", right: "both", both: "none" };
const EXTEND_LABEL: Record<ExtendDir, string> = { none: "Extend: off", right: "Extend: right →", both: "Extend: both ↔" };
const STYLE_NEXT: Record<LineStyleName, LineStyleName> = { solid: "dashed", dashed: "dotted", dotted: "solid" };

/** Floating toolbar for the currently-selected drawing (appears like TradingView). */
export function SelectionToolbar() {
  const selection = useDrawings((s) => s.selection);
  const trendlines = useDrawings((s) => s.trendlines);
  const updateTrendline = useDrawings((s) => s.updateTrendline);
  const deleteSelected = useDrawings((s) => s.deleteSelected);
  if (!selection) return null;

  const tl = selection.kind === "trendline" ? trendlines.find((t) => t.id === selection.id) : undefined;

  return (
    <div className="absolute left-1/2 top-2.5 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-line bg-panel/95 px-2 py-1.5 shadow-xl backdrop-blur">
      {tl && (
        <>
          {COLORS.map((c) => (
            <button
              key={c}
              title="Color"
              className={`h-5 w-5 rounded-full border ${tl.color === c ? "border-white" : "border-transparent"}`}
              style={{ background: c }}
              onClick={() => updateTrendline(tl.id, { color: c })}
            />
          ))}
          <div className="mx-1 h-5 w-px bg-line" />
          <button className="btn !px-2 !py-1" title="Line style" onClick={() => updateTrendline(tl.id, { style: STYLE_NEXT[tl.style] })}>
            {tl.style === "solid" ? "──" : tl.style === "dashed" ? "- -" : "···"}
          </button>
          <button className="btn !px-2 !py-1" title="Projection" onClick={() => updateTrendline(tl.id, { extend: EXTEND_NEXT[tl.extend] })}>
            {EXTEND_LABEL[tl.extend]}
          </button>
          <button className="btn !px-2 !py-1" title="Width" onClick={() => updateTrendline(tl.id, { width: tl.width >= 4 ? 1 : tl.width + 1 })}>
            {tl.width}px
          </button>
          <div className="mx-1 h-5 w-px bg-line" />
        </>
      )}
      <button className="btn !px-2 !py-1 !text-sell" title="Delete (Del)" onClick={() => deleteSelected()}>
        🗑 Delete
      </button>
    </div>
  );
}
