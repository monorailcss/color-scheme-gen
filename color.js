// Color math: sRGB <-> linear <-> OKLab <-> OKLCH, plus gamut mapping.
// L stored internally as 0..1. C as ~0..0.4. H in degrees [0,360).

const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const linearToSrgb = (c) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

export function hexToRgb(hex) {
  const m = hex.trim().replace(/^#/, "");
  const s = m.length === 3 ? m.split("").map((x) => x + x).join("") : m;
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  const cl = (x) => Math.max(0, Math.min(255, Math.round(x)));
  return "#" + [cl(r), cl(g), cl(b)]
    .map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function rgbToOklab({ r, g, b }) {
  const R = srgbToLinear(r / 255);
  const G = srgbToLinear(g / 255);
  const B = srgbToLinear(b / 255);
  return linearRgbToOklab(R, G, B);
}

export function linearRgbToOklab(R, G, B) {
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

export function oklabToLinearRgb({ L, a, b }) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return {
    R:  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    G: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    B: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

export function oklabToRgb(lab) {
  const { R, G, B } = oklabToLinearRgb(lab);
  return {
    r: linearToSrgb(R) * 255,
    g: linearToSrgb(G) * 255,
    b: linearToSrgb(B) * 255,
  };
}

export function oklabToOklch({ L, a, b }) {
  const C = Math.hypot(a, b);
  let H = Math.atan2(b, a) * 180 / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

export function oklchToOklab({ L, C, H }) {
  const rad = (H * Math.PI) / 180;
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

export function rgbToOklch(rgb) { return oklabToOklch(rgbToOklab(rgb)); }
export function oklchToRgb(lch) { return oklabToRgb(oklchToOklab(lch)); }

// True if linear RGB triple is inside sRGB gamut [0,1] (with small epsilon).
function inGamutLinear(R, G, B, eps = 1e-4) {
  return R >= -eps && R <= 1 + eps &&
         G >= -eps && G <= 1 + eps &&
         B >= -eps && B <= 1 + eps;
}

export function isOklchInGamut({ L, C, H }) {
  const { R, G, B } = oklabToLinearRgb(oklchToOklab({ L, C, H }));
  return inGamutLinear(R, G, B);
}

// Binary-search the largest chroma <= C that keeps (L, H) in sRGB gamut.
export function gamutMapOklch({ L, C, H }) {
  if (isOklchInGamut({ L, C, H })) return { L, C, H };
  let lo = 0, hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (isOklchInGamut({ L, C: mid, H })) lo = mid; else hi = mid;
  }
  return { L, C: lo, H };
}

// Clamp final RGB to [0,255] for rendering after gamut mapping.
export function oklchToHex(lch) {
  const mapped = gamutMapOklch(lch);
  const { r, g, b } = oklchToRgb(mapped);
  const cl = (x) => Math.max(0, Math.min(255, x));
  return rgbToHex({ r: cl(r), g: cl(g), b: cl(b) });
}

// Format "oklch(L% C H)" per spec: L 1dp (strip trailing .0), C 3dp, H 3dp.
export function formatOklch({ L, C, H }) {
  let ls = (Math.round(L * 100 * 10) / 10).toString();
  if (ls.endsWith(".0")) ls = ls.slice(0, -2);
  const cs = (Math.round(C * 1000) / 1000).toFixed(3);
  const hs = (Math.round(H * 1000) / 1000).toFixed(3);
  return `oklch(${ls}% ${cs} ${hs})`;
}
