import type { Bar, SignalFlags } from "../data/types";
import { supabase, requireUserId } from "./supabase";
import { hasCompression, gzipToBase64, gunzipFromBase64 } from "./compress";

/**
 * Cloud persistence (Supabase Postgres). Everything is keyed by the signed-in
 * user (enforced by Row-Level Security) and a dataset id, so loaded data,
 * drawings, decisions, and replay position sync across devices.
 *
 * The public surface mirrors the previous IndexedDB layer 1:1 so the rest of
 * the app is unchanged: datasets and decisions have their own tables; drawings,
 * settings, replay position, and the last-open dataset live in the generic `kv`
 * table (key/value), exactly as they did in the old `kv` object store.
 */

export interface StoredDataset {
  id: string;
  name: string;
  bars: Bar[];
  csvFlags: SignalFlags[] | null;
  hasCsvSignals: boolean;
  createdAt: number;
}

export interface StoredDecision {
  // key = `${datasetId}:${signalTime}`
  key: string;
  datasetId: string;
  signalTime: number;
  decision: "take" | "skip";
  note?: string;
  rating?: string;
  updatedAt: number;
}

/** Per-dataset replay position (kv key `pos:<datasetId>`). */
export interface StoredPosition {
  cur: number;
  reveal: number;
}

// ---- datasets ----
// The `bars` cell holds either a legacy Bar[] (old uncompressed rows) or a
// compressed envelope { __gz } produced below — large bar arrays exceed the
// API's request-size limit unless gzipped first.
type GzEnvelope = { __gz: string };
interface DatasetRow {
  id: string;
  name: string;
  bars: Bar[] | GzEnvelope;
  csv_flags: SignalFlags[] | null;
  has_csv_signals: boolean;
  created_at: string;
}

function isGz(v: unknown): v is GzEnvelope {
  return typeof v === "object" && v != null && typeof (v as GzEnvelope).__gz === "string";
}

async function rowToDataset(r: DatasetRow): Promise<StoredDataset> {
  let bars: Bar[];
  let csvFlags: SignalFlags[] | null = r.csv_flags;
  if (isGz(r.bars)) {
    const parsed = JSON.parse(await gunzipFromBase64(r.bars.__gz)) as { bars: Bar[]; csvFlags: SignalFlags[] | null };
    bars = parsed.bars;
    csvFlags = parsed.csvFlags ?? null;
  } else {
    bars = r.bars;
  }
  return {
    id: r.id,
    name: r.name,
    bars,
    csvFlags,
    hasCsvSignals: r.has_csv_signals,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export async function saveDataset(ds: StoredDataset) {
  const user_id = await requireUserId();
  // Compress bars (+ csv flags) into one gzipped envelope so big datasets fit;
  // fall back to raw arrays where CompressionStream is unavailable.
  let barsCell: Bar[] | GzEnvelope = ds.bars;
  let csvCell: SignalFlags[] | null = ds.csvFlags;
  if (hasCompression) {
    const gz = await gzipToBase64(JSON.stringify({ bars: ds.bars, csvFlags: ds.csvFlags }));
    barsCell = { __gz: gz };
    csvCell = null; // folded into the envelope
  }
  const { error } = await supabase.from("datasets").upsert({
    user_id,
    id: ds.id,
    name: ds.name,
    bars: barsCell,
    csv_flags: csvCell,
    has_csv_signals: ds.hasCsvSignals,
    created_at: new Date(ds.createdAt).toISOString(),
  });
  if (error) throw new Error(`Couldn't save dataset to the cloud: ${error.message}`);
}

export async function getDataset(id: string): Promise<StoredDataset | undefined> {
  const { data, error } = await supabase.from("datasets").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Couldn't load dataset: ${error.message}`);
  return data ? rowToDataset(data as DatasetRow) : undefined;
}

export async function listDatasets(): Promise<StoredDataset[]> {
  // Metadata only — the switcher needs id/name, not the (heavy) bars payload.
  const { data } = await supabase
    .from("datasets")
    .select("id,name,has_csv_signals,created_at")
    .order("created_at", { ascending: false });
  type Meta = { id: string; name: string; has_csv_signals: boolean; created_at: string };
  return ((data ?? []) as Meta[]).map((r) => ({
    id: r.id,
    name: r.name,
    bars: [],
    csvFlags: null,
    hasCsvSignals: r.has_csv_signals,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

export async function deleteDataset(id: string) {
  await supabase.from("datasets").delete().eq("id", id);
  await supabase.from("decisions").delete().eq("dataset_id", id);
  // drawings/trades and replay position live in kv, keyed by dataset id
  await supabase.from("kv").delete().eq("key", `drawings:${id}`);
  await supabase.from("kv").delete().eq("key", posKey(id));
}

// ---- decisions ----
interface DecisionRow {
  dataset_id: string;
  signal_time: number;
  decision: "take" | "skip";
  note: string | null;
  rating: string | null;
  updated_at: string;
}

export async function saveDecision(dec: StoredDecision) {
  const user_id = await requireUserId();
  await supabase.from("decisions").upsert(
    {
      user_id,
      dataset_id: dec.datasetId,
      signal_time: dec.signalTime,
      decision: dec.decision,
      note: dec.note ?? null,
      rating: dec.rating ?? null,
      updated_at: new Date(dec.updatedAt).toISOString(),
    },
    { onConflict: "user_id,dataset_id,signal_time" },
  );
}

export async function deleteDecision(key: string) {
  // key = `${datasetId}:${signalTime}` — split on the LAST colon (the id may
  // itself contain colons; the trailing segment is always the numeric time).
  const cut = key.lastIndexOf(":");
  const datasetId = key.slice(0, cut);
  const signalTime = Number(key.slice(cut + 1));
  await supabase.from("decisions").delete().eq("dataset_id", datasetId).eq("signal_time", signalTime);
}

export async function getDecisions(datasetId: string): Promise<StoredDecision[]> {
  const { data } = await supabase.from("decisions").select("*").eq("dataset_id", datasetId);
  return ((data ?? []) as DecisionRow[]).map((r) => ({
    key: `${r.dataset_id}:${r.signal_time}`,
    datasetId: r.dataset_id,
    signalTime: r.signal_time,
    decision: r.decision,
    note: r.note ?? undefined,
    rating: r.rating ?? undefined,
    updatedAt: new Date(r.updated_at).getTime(),
  }));
}

// ---- replay position (resume where the user left off) ----
const posKey = (id: string) => `pos:${id}`;
export async function savePosition(datasetId: string, pos: StoredPosition) {
  await kvSet(posKey(datasetId), pos);
}
export async function getPosition(datasetId: string) {
  return kvGet<StoredPosition>(posKey(datasetId));
}

// ---- generic kv (settings, last-open dataset, per-dataset drawings & position) ----
export async function kvGet<T>(key: string): Promise<T | undefined> {
  const { data } = await supabase.from("kv").select("value").eq("key", key).maybeSingle();
  return (data?.value as T | undefined) ?? undefined;
}
export async function kvSet(key: string, value: unknown) {
  const user_id = await requireUserId();
  const { error } = await supabase.from("kv").upsert({ user_id, key, value }, { onConflict: "user_id,key" });
  if (error) throw new Error(`Couldn't save to the cloud: ${error.message}`);
}
