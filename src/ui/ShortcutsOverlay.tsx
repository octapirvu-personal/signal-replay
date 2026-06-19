const SHORTCUTS: [string, string][] = [
  ["→ / ←", "Next / previous signal"],
  ["Shift + → / ←", "Step one candle forward / back"],
  ["↑ / Space", "Reveal N bars forward"],
  ["↓", "Re-hide N bars"],
  ["T", "Take the current signal"],
  ["K / S", "Skip the current signal"],
  ["F", "Toggle follow-frontier"],
  ["1 / 2", "Cursor / Trendline tool"],
  ["3 / 4", "Plot Long / Short at the current candle"],
  ["E", "Journal a trade on the current signal"],
  ["J", "Open / close the trade journal"],
  ["Delete / Backspace", "Delete the selected drawing/trade"],
  ["Esc", "Cancel draw / deselect / close"],
  ["?", "Toggle this help"],
];

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-[420px] rounded-xl border border-line bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {SHORTCUTS.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between text-[13px]">
              <span className="text-muted">{label}</span>
              <span className="kbd">{k}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
