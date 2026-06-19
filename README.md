# Signal Replay — blind backtester

A polished, TradingView-Bar-Replay-style app for **manual, blind backtesting of trading
signals**. Load OHLC data, step through BUY/SELL signals one at a time with the future
hidden, decide "would I take this trade?", reveal bars to see how it played out, and log
your decisions — all with a chart that **never re-zooms or rebuilds** as you navigate.

Built with **TypeScript + Vite + React**, **lightweight-charts v4**, **Tailwind**,
**Zustand**, and **IndexedDB** (via `idb`). No backend; everything runs locally and offline.

## Run / build / test

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle in dist/
npm run preview    # serve the built bundle
npm test           # unit tests (data parsing + BB strategy)
npm run typecheck  # tsc -b, no emit
```

Requires Node 18+ (developed on 22).

## What works today (Milestones M1–M4)

This delivers the foundation, the **priority replay engine**, journaling + stats, and the
drawing/trade tools, runnable end-to-end:

- **M1 — data & shell.** CSV import via drag-drop / picker with robust format auto-detection
  (MT4, MT5, TradingView, generic), delimiter + header detection, combined/!separate
  date+time, ISO and UNIX timestamps, ascending sort + de-dup, and a column-mapping bar when
  detection isn't confident. Candles render; zoom persists. Pure parsing is unit-tested.
- **M2 — replay engine.** Frontier navigation that feels like TradingView Bar Replay:
  signal-to-signal stepping, fine candle stepping, reveal/hide bars, a follow-frontier
  toggle, a draggable scrubber with signal ticks, and an (optional) streaming reveal.
- **M3 — journaling & stats.** Take/skip decisions with notes/ratings, the signal list,
  results CSV export, and a **Performance panel**: take-decision outcomes over a configurable
  horizon (win rate, avg favorable/adverse, expectancy) with a histogram, plus a trades
  performance summary (win rate, expectancy, total R).
- **M4 — drawing & trade tools** (anchored in bar-index + price, TradingView-style):
  - **Trendline** — press the start point and the line follows your cursor **live**;
    release a drag (or click a second time) to commit. Select it to drag either endpoint or
    the whole body. A floating toolbar sets color, line style, width, and **projection**
    (`extend` none / right → / both ↔). Slope-projected just like TradingView.
  - **Long / Short position** — press at the entry, drag to the target; the **position box
    draws live** (entry line, green TP zone, red SL zone) with SL auto-placed from your
    reward:risk. Release to commit, then drag the Entry / SL / TP handles to fine-tune. The
    box shows R:R and the **objective outcome** (which of SL/TP hit first in the data) in R.
  - **⚡ Trade-from-signal (key `E`)** — the fastest path: instantly journal a trade on the
    current signal, direction matching the signal, entry at its close. Then tweak SL/TP.
  - **🧲 Magnet** — snap anchors to the nearest candle O/H/L/C.
  - Every trade is **auto-journalled** — it appears in the Trades tab and feeds the stats.
  - Drawings + trades are anchored in (time, price) and **persist per dataset**.

### Verified acceptance criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | No rebuild on navigation; bar spacing unchanged; Follow-off = no view move; Follow-on = animated pan | ✅ verified in-browser |
| 2 | Smooth forward reveal via `series.update()` only (no full redraw) | ✅ |
| 3 | Future hidden at the frontier; time axis stable | ✅ |
| 4 | Drawing live preview: trendline follows the cursor before the second click | ✅ |
| 5 | Drawing live edit: select & drag endpoints/body; stays anchored through zoom/pan/replay | ✅ |
| 6 | Drawings/decisions/notes/settings/dataset persist across reload | ✅ |
| 7 | MT4 / MT5 / TradingView import; ambiguous files surface the mapping bar | ✅ (unit-tested) |
| 8 | Default BB re-entry signals match a known fixture exactly | ✅ unit test |

Trade outcome evaluation and decision-horizon stats are unit-tested too (`src/backtest`).

### Still to come

- **M4 extras** — ray / horizontal / vertical line / rectangle tools, the per-object styling
  toolbar (color/width/style picker), and multi-select. The trendline + trade tools and the
  shared drawing layer (anchoring, hit-testing, drag, persistence) are in place to extend.
- **M5** — settings panel, 100k-bar perf pass (Web Worker parsing), and **Tauri** desktop
  packaging. The core is kept framework-agnostic so the Tauri wrapper is thin.

## The replay engine — design notes

The prototype "refreshed" on every step because it called `series.setData(slice)` (full
rebuild) and `setVisibleLogicalRange()` (which rescales bar spacing = a zoom reset) on each
navigation. This rebuild fixes both:

- **Zoom is `timeScale.barSpacing` only**, changed exclusively by the user (wheel/pinch) and
  persisted. Navigation never touches it.
- **Forward reveal uses `series.update()`** to append the next bar — incremental, no rebuild.
- **Navigation pans with `scrollToPosition()`**, never `setVisibleLogicalRange()`.
- **Backward (re-hide)** is the only path that needs `setData`; the visible range and bar
  spacing are captured and restored around it so there is no visible jump.

### Why not literal trailing whitespace?

The spec prescribes loading the whole series as trailing **whitespace** points and turning
each into a candle with `update()`. On the installed **lightweight-charts v4.2**, that
doesn't work: `series.update()` rejects any point older than the last (`"Cannot update
oldest data"`), and the time scale won't pan into trailing whitespace (it pins the right
edge to the last real bar, so `scrollToPosition`/`rightOffset` can't open a future gap).

Per the spec's own guidance ("verify the API against the installed version; do not guess"),
the engine instead holds **only the revealed bars** and **appends** newer bars with
`update()`. This delivers the identical observable result — no rebuild, a stable axis, a
hidden future, and a configurable right-edge anchor — using the library's supported path.
See the header comment in [`src/chart/replayEngine.ts`](src/chart/replayEngine.ts).

## Architecture

```
src/
  app/         App shell, keyboard, dataset load/restore, replay controls
  state/       Zustand stores: app (dataset/signals/replay/decisions), settings (persisted)
  data/        CSV parsing + format detection + time parsing  (pure, unit-tested)
  signals/     Strategy interface + BB re-entry + file signals (pure, unit-tested)
  chart/       Chart setup + the replay engine (whitespace-free update()/scroll)
  backtest/    Results CSV export + tally/stats
  ui/          TopBar, StatusBar, ChartPanel, Sidebar, Scrubber, MappingBar, ShortcutsOverlay
  persistence/ IndexedDB wrappers (datasets, decisions, drawings, kv)
  drawings/    (M4) drawing layer
  workers/     (M5) heavy parsing off the main thread
```

`data/` and `signals/` are pure and DOM-free. All the tricky chart behavior lives in
`chart/` behind a small imperative interface, kept out of React's render loop so chart
frames never trigger re-renders.

## Keyboard shortcuts

`→ / ←` next / prev signal · `Shift+→ / ←` step one candle · `↑ / Space` reveal · `↓` hide ·
`T` take · `K`/`S` skip · `F` toggle follow · `1`/`2`/`3`/`4` cursor / trendline / long / short
tool · `E` journal a trade on the current signal · `Delete` remove selected drawing · `?` help ·
`Esc` cancel/deselect. Press `?` in-app for the full list.

## Data formats

Drop or pick a `.csv`/`.txt`. Auto-detected: MT5 tab export (`<DATE> <TIME> <OPEN>…`), MT4
History Center (`date,time,o,h,l,c,vol`, no header), TradingView (single ISO/UNIX `time`
column + OHLC), and generic OHLC. Buy/Sell columns are picked up automatically when present.
If detection is ambiguous, a mapping bar lets you assign columns and re-parse. There's also a
**Load sample** button (synthetic series) to try the app with no file.
