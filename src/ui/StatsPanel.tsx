import { useMemo } from "react";
import { useApp } from "../state/app";
import { useSettings } from "../state/settings";
import { useDrawings } from "../state/drawings";
import { decisionStats, type HistogramBin } from "../backtest/stats";
import { evaluateTrade, tradeStats } from "../backtest/trades";

export function StatsPanel() {
  const { bars, signals, decisions } = useApp();
  const horizon = useSettings((s) => s.statHorizon);
  const setSetting = useSettings((s) => s.set);
  const trades = useDrawings((s) => s.trades);

  const dStats = useMemo(
    () => decisionStats(bars, signals, decisions, horizon),
    [bars, signals, decisions, horizon],
  );
  const tStats = useMemo(() => tradeStats(trades.map((t) => evaluateTrade(bars, t))), [trades, bars]);

  return (
    <div className="border-t border-line p-3 text-[12px]">
      <div className="mb-2 flex items-center justify-between">
        <span className="stat-k">Performance</span>
        <label className="fld">
          horizon
          <input
            type="number"
            className="num !w-12 !py-0.5"
            min={1}
            max={500}
            value={horizon}
            onChange={(e) => setSetting("statHorizon", Math.max(1, Number(e.target.value)))}
          />
        </label>
      </div>

      {/* decisions */}
      <Row label="Decided" value={`${dStats.decided}  ·  ✓ ${dStats.takes}  ✗ ${dStats.skips}`} />
      {dStats.evaluated > 0 && (
        <>
          <Row label={`Take win rate @${horizon}`} value={pct(dStats.winRate * 100)} good={dStats.winRate >= 0.5} />
          <Row label="Avg favorable" value={pct(dStats.avgFavorable)} good />
          <Row label="Avg adverse" value={pct(dStats.avgAdverse)} good={false} />
          <Row label="Expectancy" value={pct(dStats.expectancy)} good={dStats.expectancy >= 0} />
          <Histogram bins={dStats.histogram} unit="%" />
        </>
      )}

      {/* trades */}
      <div className="mt-3 mb-1 stat-k">Trades ({tStats.total})</div>
      {tStats.total === 0 ? (
        <div className="text-muted">Plot a trade (⚡ or the ▲/▼ tools) to journal entry/SL/TP.</div>
      ) : (
        <>
          <Row label="Closed" value={`${tStats.wins + tStats.losses}  ·  ${tStats.open} open`} />
          <Row label="Win rate" value={pct(tStats.winRate * 100)} good={tStats.winRate >= 0.5} />
          <Row label="Expectancy" value={`${tStats.expectancy.toFixed(2)} R`} good={tStats.expectancy >= 0} />
          <Row label="Total" value={`${tStats.totalR >= 0 ? "+" : ""}${tStats.totalR.toFixed(1)} R`} good={tStats.totalR >= 0} />
        </>
      )}
    </div>
  );
}

function Row({ label, value, good }: { label: string; value: string; good?: boolean }) {
  const color = good === undefined ? "text-ink" : good ? "text-buy" : "text-sell";
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted">{label}</span>
      <span className={color}>{value}</span>
    </div>
  );
}

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function Histogram({ bins, unit }: { bins: HistogramBin[]; unit: string }) {
  if (!bins.length) return null;
  const max = Math.max(1, ...bins.map((b) => b.count));
  const W = 260;
  const H = 44;
  const bw = W / bins.length;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 12}`} className="mt-1.5">
      {bins.map((b, i) => {
        const h = (b.count / max) * H;
        const mid = (b.from + b.to) / 2;
        const color = mid >= 0 ? "#26a69a" : "#ef5350";
        return (
          <rect key={i} x={i * bw + 1} y={H - h} width={bw - 2} height={h} fill={color} opacity={0.8}>
            <title>{`${b.from.toFixed(1)}${unit}..${b.to.toFixed(1)}${unit}: ${b.count}`}</title>
          </rect>
        );
      })}
      {/* zero line */}
      <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="#2a3240" strokeWidth={1} />
      <text x={2} y={H + 10} fontSize={9} fill="#8b97a7">
        {bins[0].from.toFixed(1)}{unit}
      </text>
      <text x={W - 2} y={H + 10} fontSize={9} fill="#8b97a7" textAnchor="end">
        +{bins[bins.length - 1].to.toFixed(1)}{unit}
      </text>
    </svg>
  );
}
