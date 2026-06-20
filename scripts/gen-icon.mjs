// Generates the Svinafell app icon (public/icon-512.png) — a dark tile with the
// gradient glacier mark, matching the splash. Pure Node (zlib), no deps.
// Run: node scripts/gen-icon.mjs   (then sips downscales to 192/180).
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const S = 512;
const cx = 256;
const cy = 235;

const ACCENT = [59, 130, 246];
const LIGHT = [230, 237, 243];
const BG_IN = [20, 27, 38];
const BG_OUT = [14, 17, 22];

// glacier peaks + horizon, in 512 space
const peaks = [
  [128, 360],
  [212, 188],
  [272, 284],
  [344, 166],
  [416, 360],
];
const STROKE = 15;
const ring = { r: 196, w: 6 };

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const raw = Buffer.alloc(S * (S * 4 + 1));
const maxR = Math.hypot(cx, cy);
for (let y = 0; y < S; y++) {
  const rowStart = y * (S * 4 + 1);
  raw[rowStart] = 0; // filter: none
  for (let x = 0; x < S; x++) {
    // background radial
    const d = Math.min(1, Math.hypot(x - cx, y - cy) / maxR);
    let [r, g, b] = mix(BG_IN, BG_OUT, d);

    // mark gradient colour at this pixel
    const tg = Math.max(0, Math.min(1, (x + y - 120) / (2 * S - 240)));
    const mc = mix(ACCENT, LIGHT, tg);

    // peaks polyline (anti-aliased)
    let dist = Infinity;
    for (let i = 0; i < peaks.length - 1; i++) {
      dist = Math.min(dist, distSeg(x, y, peaks[i][0], peaks[i][1], peaks[i + 1][0], peaks[i + 1][1]));
    }
    let a = Math.max(0, Math.min(1, STROKE / 2 + 0.5 - dist));
    // ring
    const rd = Math.abs(Math.hypot(x - cx, y - cy) - ring.r);
    const ra = Math.max(0, Math.min(1, ring.w / 2 + 0.5 - rd)) * 0.5;
    a = Math.max(a, ra);

    r = lerp(r, mc[0], a);
    g = lerp(g, mc[1], a);
    b = lerp(b, mc[2], a);

    const o = rowStart + 1 + x * 4;
    raw[o] = r | 0;
    raw[o + 1] = g | 0;
    raw[o + 2] = b | 0;
    raw[o + 3] = 255;
  }
}

// ---- PNG encode ----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
writeFileSync(new URL("../public/icon-512.png", import.meta.url), png);
console.log("wrote public/icon-512.png", png.length, "bytes");
