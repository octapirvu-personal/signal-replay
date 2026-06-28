import { useSettings } from "../state/settings";
import { STRATEGIES, getStrategy, defaultParams } from "../signals";
import { recomputeSignals } from "../app/dataset";

/** Picks which strategy generates the navigable buy/sell signals. */
export function StrategySelect() {
  const strategyId = useSettings((s) => s.strategyId);
  return (
    <label className="fld">
      Signal
      <select
        className="sel"
        value={strategyId}
        onChange={(e) => {
          const st = getStrategy(e.target.value);
          useSettings.getState().set("strategyId", st.id);
          useSettings.getState().set("strategyParams", defaultParams(st));
          recomputeSignals(true);
        }}
      >
        {STRATEGIES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
