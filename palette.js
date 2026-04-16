// Palette generation. See CLAUDE.md for the architecture overview.
// L curves were fit from averaged Tailwind palettes; chroma logic differs
// for foreground (relative to anchor) vs neutral (absolute with intensity).

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const L_FOREGROUND          = [0.970, 0.940, 0.890, 0.820, 0.720, 0.640, 0.560, 0.490, 0.430, 0.380, 0.270];
const L_FOREGROUND_CONTRAST = [0.980, 0.950, 0.910, 0.840, 0.740, 0.640, 0.540, 0.460, 0.390, 0.320, 0.200];
const L_NEUTRAL             = [0.985, 0.970, 0.925, 0.870, 0.710, 0.550, 0.440, 0.370, 0.270, 0.210, 0.140];
const L_NEUTRAL_CONTRAST    = [0.990, 0.975, 0.930, 0.880, 0.720, 0.540, 0.420, 0.340, 0.240, 0.180, 0.100];

const C_FOREGROUND_FRACTION = [0.06, 0.14, 0.26, 0.47, 0.77, 1.00, 1.05, 0.96, 0.78, 0.62, 0.42];
const C_NEUTRAL_BASE        = [0.002, 0.003, 0.005, 0.010, 0.018, 0.028, 0.024, 0.022, 0.016, 0.012, 0.006];
const C_NEUTRAL_HELD_TAIL   = [0.002, 0.003, 0.005, 0.010, 0.018, 0.028, 0.026, 0.025, 0.024, 0.023, 0.022];

export function anchorIndex(step) {
  const i = STEPS.indexOf(step);
  return i === -1 ? 5 : i;
}

export function generatePalette(input) {
  const {
    seed,               // { L:0..1, C, H }
    kind,               // "foreground" | "neutral"
    anchorStep = 500,
    chromaScale = 1.0,
    hueShift = 0,
    highContrast = false,
    darkChromaRetention = 0.5,
  } = input;

  const ai = anchorIndex(anchorStep);

  const Ls = kind === "foreground"
    ? (highContrast ? L_FOREGROUND_CONTRAST : L_FOREGROUND)
    : (highContrast ? L_NEUTRAL_CONTRAST : L_NEUTRAL);

  const stops = [];
  for (let i = 0; i < 11; i++) {
    const L = Ls[i];
    let C;
    if (kind === "foreground") {
      const denom = C_FOREGROUND_FRACTION[ai] || 1;
      const peak = seed.C / denom;
      C = peak * C_FOREGROUND_FRACTION[i] * chromaScale;
    } else {
      const baseAtAnchor = C_NEUTRAL_BASE[ai] || 1e-6;
      const intensity = seed.C / baseAtAnchor;
      let shape;
      if (i < 6) shape = C_NEUTRAL_BASE[i];
      else {
        const t = darkChromaRetention;
        shape = C_NEUTRAL_BASE[i] * (1 - t) + C_NEUTRAL_HELD_TAIL[i] * t;
      }
      C = shape * intensity * chromaScale;
    }
    if (C < 0) C = 0;
    let H = seed.H + hueShift * (i - ai) / 10;
    H = ((H % 360) + 360) % 360;
    stops.push({ step: STEPS[i], L, C, H });
  }
  return stops;
}
