import { loadCsvText, applyParseResult } from "./dataset";
import { makeSample } from "./sampleData";

export type LoadOutcome = { ok: boolean; needsMapping: boolean; error?: string };

/** Read a File and route it through the parser. */
export function readFileAndLoad(file: File): Promise<LoadOutcome> {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => {
      void loadCsvText(file.name, String(fr.result)).then(resolve);
    };
    fr.onerror = () => resolve({ ok: false, needsMapping: false, error: "Failed to read file." });
    fr.readAsText(file);
  });
}

/** Load the built-in synthetic dataset. */
export async function loadSample(): Promise<LoadOutcome> {
  await applyParseResult("sample.csv", makeSample());
  return { ok: true, needsMapping: false };
}
