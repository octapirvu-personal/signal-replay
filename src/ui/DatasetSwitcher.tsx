import { useEffect, useState } from "react";
import { useApp } from "../state/app";
import { listDatasets, deleteDataset, type StoredDataset } from "../persistence/db";
import { openDataset } from "../app/dataset";

/** Strip a trailing .csv/.txt so the dropdown reads as a clean symbol name. */
const label = (name: string) => name.replace(/\.(csv|txt)$/i, "");

/**
 * Symbol/dataset picker (top-left). Lists every CSV you've loaded so you can
 * switch between symbols; each carries its own decisions, drawings, trades, and
 * journal. Refreshes whenever the active dataset changes (e.g. a new upload).
 */
export function DatasetSwitcher({ compact = false }: { compact?: boolean }) {
  const datasetId = useApp((s) => s.datasetId);
  const datasetName = useApp((s) => s.datasetName);
  const [list, setList] = useState<StoredDataset[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = () => void listDatasets().then(setList);

  // re-list on mount and whenever the active dataset changes (covers new
  // uploads, switches, and deletes)
  useEffect(refresh, [datasetId]);

  if (!datasetId && list.length === 0) return null;

  // Always show the active dataset, even if the async save hasn't landed in the
  // list yet (avoids a blank select right after an upload).
  const options =
    datasetId && !list.some((d) => d.id === datasetId)
      ? [{ id: datasetId, name: datasetName } as StoredDataset, ...list]
      : list;

  const onSwitch = async (id: string) => {
    if (!id || id === datasetId) return;
    setBusy(true);
    await openDataset(id);
    setBusy(false);
  };

  const onDelete = async () => {
    if (!datasetId) return;
    const current = options.find((d) => d.id === datasetId);
    if (!window.confirm(`Delete "${label(current?.name ?? datasetName)}" and all its decisions, drawings, and trades? This can't be undone.`)) return;
    setBusy(true);
    await deleteDataset(datasetId);
    // switch to another dataset if one remains, else clear to empty
    const remaining = options.filter((d) => d.id !== datasetId);
    if (remaining.length) await openDataset(remaining[0].id);
    else useApp.getState().reset();
    setBusy(false);
  };

  // Compact (mobile bottom bar): a narrow select that clips the name to ~6
  // chars; tapping opens the native picker showing the full names.
  if (compact) {
    return (
      <select
        className="sel w-[88px] truncate"
        disabled={busy}
        value={datasetId ?? ""}
        onChange={(e) => void onSwitch(e.target.value)}
        title="Switch symbol"
      >
        {!datasetId && <option value="">—</option>}
        {options.map((d) => (
          <option key={d.id} value={d.id}>
            {label(d.name)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <label className="fld">
      Symbol
      <select className="sel" disabled={busy} value={datasetId ?? ""} onChange={(e) => void onSwitch(e.target.value)}>
        {!datasetId && <option value="">—</option>}
        {options.map((d) => (
          <option key={d.id} value={d.id}>
            {label(d.name)}
          </option>
        ))}
      </select>
      {datasetId && (
        <button className="text-muted hover:text-sell" title="Delete this dataset" disabled={busy} onClick={() => void onDelete()}>
          🗑
        </button>
      )}
    </label>
  );
}
