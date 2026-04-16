// Converts benjamin-moore.json into a compact ES module with
// precomputed OKLab values for fast nearest-color lookup.
// Run: node scripts/build-paint-data.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

function hexToRgb(hex) {
  const s = hex.replace(/^#/, "");
  const n = parseInt(s.length === 3 ? s.split("").map((x) => x + x).join("") : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToOklab(r, g, b) {
  const R = srgbToLinear(r / 255);
  const G = srgbToLinear(g / 255);
  const B = srgbToLinear(b / 255);
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const escape = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const raw = JSON.parse(readFileSync(join(ROOT, "benjamin-moore.json"), "utf8"));

// De-duplicate by name so we don't emit the same suggestion twice.
const seen = new Set();
const entries = [];
for (const { hex, name } of raw) {
  if (seen.has(name)) continue;
  seen.add(name);
  const [r, g, b] = hexToRgb(hex);
  const [L, a, bb] = rgbToOklab(r, g, b);
  entries.push({ L, a, b: bb, name });
}

// Histogram-equalize L: the source set is a paint collection — ~60% of
// entries sit above L=0.7 and none below L=0.3, so dark seeds collapse onto
// the same 5-10 names. We don't need the L to match the real paint; we just
// need a well-distributed name pool. Sort by L and reassign rank-based L
// in [0, 1] so name density is uniform across the lightness range.
entries.sort((x, y) => x.L - y.L);
const N = entries.length;
for (let i = 0; i < N; i++) entries[i].L = N === 1 ? 0.5 : i / (N - 1);

const rows = entries.map(
  (e) => `[${round(e.L, 4)},${round(e.a, 4)},${round(e.b, 4)},"${escape(e.name)}"]`
);

const out = `// Auto-generated. Do not edit by hand.
// Each row: [L, a, b, name]. NOTE: L is histogram-equalized (rank-based),
// not the source color's real OKLab L — we're using the data purely as a
// name pool for nearest-neighbor suggestions, not as accurate color labels.
export const COLOR_NAMES = [
${rows.join(",\n")}
];
`;

const outPath = join(ROOT, "color-names.js");
writeFileSync(outPath, out);
console.log(`Wrote ${outPath} — ${rows.length} names, ${(out.length / 1024).toFixed(1)} KB`);
