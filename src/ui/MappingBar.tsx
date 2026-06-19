import { useState } from "react";
import { useApp } from "../state/app";
import { applyMapping } from "../app/dataset";
import type { ColumnMap } from "../data/types";

const FIELDS: { key: keyof ColumnMap; label: string; optional?: boolean }[] = [
  { key: "date", label: "Date" },
  { key: "time", label: "Time", optional: true },
  { key: "open", label: "Open" },
  { key: "high", label: "High" },
  { key: "low", label: "Low" },
  { key: "close", label: "Close" },
  { key: "buy", label: "Buy", optional: true },
  { key: "sell", label: "Sell", optional: true },
];

/** Column-mapping bar, shown when auto-detection wasn't confident. */
export function MappingBar() {
  const mapping = useApp((s) => s.mapping);
  const setMapping = useApp((s) => s.setMapping);
  const [error, setError] = useState("");
  if (!mapping) return null;

  function update(key: keyof ColumnMap, value: number) {
    if (!mapping) return;
    setMapping({ ...mapping, map: { ...mapping.map, [key]: value } });
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-line bg-[#11161f] px-4 py-2 text-xs">
      <strong className="text-ink">Columns:</strong>
      {FIELDS.map((f) => (
        <label className="fld" key={f.key}>
          {f.label}
          <select
            className="sel"
            value={mapping.map[f.key]}
            onChange={(e) => update(f.key, Number(e.target.value))}
          >
            {f.optional && <option value={-1}>(none)</option>}
            {mapping.headers.map((h, i) => (
              <option key={i} value={i}>
                {h || `col${i}`}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button
        className="btn btn-primary"
        onClick={() =>
          void applyMapping().then((r) => {
            if (!r.ok) setError(r.error ?? "Mapping failed.");
            else setError("");
          })
        }
      >
        Apply
      </button>
      <span className="text-sell">{error || mapping.message}</span>
    </div>
  );
}
