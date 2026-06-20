/**
 * Gzip helpers (browser CompressionStream) for shrinking large payloads before
 * they hit Supabase — OHLC bar arrays compress ~10-20×, keeping even very large
 * datasets under the API's request-size limit.
 */

export const hasCompression = typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

export async function gzipToBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return base64FromBytes(new Uint8Array(buf));
}

export async function gunzipFromBase64(b64: string): Promise<string> {
  const bytes = bytesFromBase64(b64);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

// Chunked base64 (btoa chokes on very large binary strings in one shot).
function base64FromBytes(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
