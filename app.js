import {
  hexToRgb, rgbToHex, rgbToOklab, rgbToOklch, oklchToHex, oklchToRgb,
  gamutMapOklch, isOklchInGamut, formatOklch,
} from "./color.js";
import { generatePalette, STEPS, anchorIndex } from "./palette.js";
import { TAILWIND } from "./tailwind-palettes.js";
import { COLOR_NAMES } from "./color-names.js";

const $ = (id) => document.getElementById(id);

const state = {
  name: "",
  lastAutoName: "",  // last paint name we auto-filled, so we know when to replace
  seedHex: "#7e3e3e",
  seed: null,        // OKLCH
  kind: "foreground",
  chromaScale: 1.0,
  hueShift: 0,
  highContrast: false,
  darkChromaRetention: 0.5,
  anchor: 500,
  compare: "",
};

// Nearest name by OKLab Euclidean distance (a good ΔE proxy for OKLab).
function nearestName(lab) {
  let best = null, bestD = Infinity;
  for (const row of COLOR_NAMES) {
    const dL = row[0] - lab.L, da = row[1] - lab.a, db = row[2] - lab.b;
    const d = dL * dL + da * da + db * db;
    if (d < bestD) { bestD = d; best = row; }
  }
  return best[3];
}

// ---- URL state sync ----

// Compact query-string encoding. Only non-default values are emitted so
// unshifted palettes produce a short URL.
function encodeStateToUrl() {
  const p = new URLSearchParams();
  p.set("s", state.seedHex.replace(/^#/, ""));
  if (state.kind !== "foreground") p.set("k", "n");
  if (state.name) p.set("n", state.name);
  if (state.chromaScale !== 1.0) p.set("cs", String(state.chromaScale));
  if (state.hueShift !== 0) p.set("hs", String(state.hueShift));
  if (state.highContrast) p.set("hc", "1");
  if (state.kind === "neutral" && state.darkChromaRetention !== 0.5)
    p.set("dcr", String(state.darkChromaRetention));
  if (state.anchor !== 500) p.set("a", String(state.anchor));
  if (state.compare) p.set("cmp", state.compare);
  return p.toString();
}

function applyStateFromUrl() {
  const p = new URLSearchParams(window.location.search);
  if (!p.toString()) return;

  const s = p.get("s");
  if (s && /^[0-9a-fA-F]{6}$/.test(s)) state.seedHex = "#" + s.toLowerCase();

  const k = p.get("k");
  if (k === "n") state.kind = "neutral";

  const n = p.get("n");
  if (n) { state.name = n; state.lastAutoName = ""; }  // user-provided name locks auto-fill

  const cs = parseFloat(p.get("cs"));
  if (!Number.isNaN(cs)) state.chromaScale = clamp(cs, 0, 2);

  const hs = parseFloat(p.get("hs"));
  if (!Number.isNaN(hs)) state.hueShift = clamp(hs, -30, 30);

  state.highContrast = p.get("hc") === "1";

  const dcr = parseFloat(p.get("dcr"));
  if (!Number.isNaN(dcr)) state.darkChromaRetention = clamp(dcr, 0, 1);

  const a = parseInt(p.get("a"), 10);
  if (STEPS.includes(a)) state.anchor = a;

  const cmp = p.get("cmp");
  if (cmp && TAILWIND[cmp]) state.compare = cmp;
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function syncUrl() {
  const qs = encodeStateToUrl();
  const url = `${window.location.pathname}${qs ? "?" + qs : ""}${window.location.hash}`;
  window.history.replaceState(null, "", url);
}

function hydrateControlsFromState() {
  $("name").value = state.name;
  $("seed-color").value = state.seedHex;
  $("seed-hex").value = state.seedHex;
  document.querySelectorAll(".seg button[data-kind]").forEach((b) => {
    b.classList.toggle("on", b.dataset.kind === state.kind);
  });
  $("dark-chroma-field").hidden = state.kind !== "neutral";
  $("chroma-scale").value = String(state.chromaScale);
  $("chroma-scale-val").textContent = state.chromaScale.toFixed(2);
  $("hue-shift").value = String(state.hueShift);
  $("hue-shift-val").textContent = `${state.hueShift}°`;
  $("high-contrast").checked = state.highContrast;
  $("dark-chroma").value = String(state.darkChromaRetention);
  $("dark-chroma-val").textContent = state.darkChromaRetention.toFixed(2);
  $("anchor").value = String(state.anchor);
  $("compare").value = state.compare;
}

function recomputeSeedFromHex() {
  const rgb = hexToRgb(state.seedHex);
  if (!rgb) return;
  state.seed = rgbToOklch(rgb);
}

function titleCase(s) {
  return s.replace(/[^a-zA-Z0-9\s\-_]/g, "")
    .split(/[\s\-_]+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
}
function slug(s) {
  return s.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function updateSuggestedName() {
  const rgb = hexToRgb(state.seedHex);
  if (!rgb) return;
  const suggested = nearestName(rgbToOklab(rgb));

  // Auto-fill name if user hasn't customized it.
  const nameEl = $("name");
  const current = nameEl.value;
  if (current === "" || current === state.lastAutoName) {
    nameEl.value = suggested;
    state.name = suggested;
    state.lastAutoName = suggested;
  }
}

function render() {
  updateSuggestedName();
  const stops = generatePalette({
    seed: state.seed,
    kind: state.kind,
    anchorStep: state.anchor,
    chromaScale: state.chromaScale,
    hueShift: state.hueShift,
    highContrast: state.highContrast,
    darkChromaRetention: state.darkChromaRetention,
  });

  renderSeedReadout();
  renderSwatches(stops);
  renderCsharp(stops);
  renderTailwind(stops);
  renderDemo(stops);
  syncUrl();
}

// Tailwind v4 uses decimal L (0..1), trailing zeros trimmed.
function formatOklchTheme({ L, C, H }) {
  const fmt = (x, d) => {
    const s = (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);
    return s.replace(/\.?0+$/, "") || "0";
  };
  return `oklch(${fmt(L, 3)} ${fmt(C, 3)} ${fmt(H, 3)})`;
}

function renderTailwind(stops) {
  const name = (state.name || "brand").trim() || "brand";
  const s = slug(name);
  const lines = ["@theme {"];
  for (const stop of stops) {
    lines.push(`  --color-${s}-${stop.step}: ${formatOklchTheme(stop)};`);
  }
  lines.push("}");
  $("tailwind").textContent = lines.join("\n");
}

function renderSeedReadout() {
  if (!state.seed) return;
  $("seed-oklch").textContent = formatOklch(state.seed);
}

function swatchEl(stop, deltaStr) {
  const oog = !isOklchInGamut(stop);
  const hex = oklchToHex(stop);
  const oogTip = "Outside the sRGB gamut — the preview is gamut-mapped (hue preserved, chroma reduced), but the stored OKLCH value is exact. It will render correctly on wide-gamut (P3) displays. To bring it inside sRGB, lower the Chroma scale slider or pick a less saturated seed.";
  const el = document.createElement("div");
  el.className = "swatch" + (oog ? " oog" : "");
  el.innerHTML = `
    <div class="chip" style="background:${hex}"${oog ? ` title="${oogTip}"` : ""}></div>
    <div class="meta">
      <span class="step">${stop.step}${oog ? ` <span class="oog-badge" title="${oogTip}">out of gamut</span>` : ""}</span>
      <span class="oklch" title="${formatOklch(stop)}">${formatOklch(stop)}</span>
      <span class="hex">${hex}</span>
      ${deltaStr ? `<span class="delta">${deltaStr}</span>` : ""}
    </div>`;
  return el;
}

function renderSwatches(stops) {
  const host = $("swatches");
  host.innerHTML = "";
  const ref = state.compare ? TAILWIND[state.compare] : null;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    let delta = "";
    if (ref) {
      const r = ref[i];
      const dL = Math.abs(s.L - r.L) * 100;
      const dC = Math.abs(s.C - r.C);
      const dH = hueDist(s.H, r.H);
      delta = `Δ L${dL.toFixed(1)} C${dC.toFixed(3)} H${dH.toFixed(1)}°`;
    }
    host.appendChild(swatchEl(s, delta));
  }

  const refHost = $("swatches-compare");
  refHost.innerHTML = "";
  if (ref) {
    const title = document.createElement("div");
    title.style.cssText = "grid-column:1/-1;color:var(--muted);font-size:11px;padding-top:8px;";
    title.textContent = `Tailwind ${state.compare}`;
    refHost.appendChild(title);
    for (const s of ref) refHost.appendChild(swatchEl(s, ""));
  }
}

function hueDist(a, b) {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function renderCsharp(stops) {
  const name = (state.name || "brand").trim() || "brand";
  const s = slug(name);
  const tc = titleCase(name);
  const lines = [`// Colors - ${tc}`];
  for (const stop of stops) {
    lines.push(`builder.Add("--color-${s}-${stop.step}", "${formatOklch(stop)}");`);
  }
  lines.push("");
  lines.push("/// <summary>");
  lines.push(`/// Represents the color name "${s}".`);
  lines.push("/// </summary>");
  lines.push(`public const string ${tc} = "${s}";`);
  $("csharp").textContent = lines.join("\n");
}

function renderDemo(stops) {
  const hex = (i) => oklchToHex(stops[i]);
  // Indices: 50=0,100=1,200=2,300=3,400=4,500=5,600=6,700=7,800=8,900=9,950=10
  const light = {
    "--demo-bg": hex(0),
    "--demo-surface": hex(1),
    "--demo-border": hex(2),
    "--demo-text": hex(9),
    "--demo-muted": hex(6),
    "--demo-accent": hex(5),
    "--demo-accent-hover": hex(6),
    "--demo-on-accent": hex(0),
  };
  const dark = {
    "--demo-bg": hex(10),
    "--demo-surface": hex(9),
    "--demo-border": hex(8),
    "--demo-text": hex(0),
    "--demo-muted": hex(4),
    "--demo-accent": hex(4),
    "--demo-accent-hover": hex(3),
    "--demo-on-accent": hex(10),
  };
  applyDemo($("demo-light"), light, "Light");
  applyDemo($("demo-dark"), dark, "Dark");
}

function applyDemo(el, vars, label) {
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.innerHTML = `
    <h3>${label} surface</h3>
    <p>A paragraph with a <a href="#">link to somewhere</a>. The quick brown fox jumps over the lazy dog — enough copy to reveal ugly combinations.</p>
    <div class="surface">
      <div class="row"><span class="chip">const x = 42;</span><span class="chip">theme.${state.name}.500</span></div>
    </div>
    <div class="divider"></div>
    <div class="row">
      <button class="primary">Primary</button>
      <button class="secondary">Secondary</button>
    </div>`;
}

// ---- Inputs ----

let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 50);
}

function bindInputs() {
  $("name").addEventListener("input", (e) => {
    state.name = e.target.value;
    state.lastAutoName = "";  // user took over — stop auto-filling
    scheduleRender();
  });

  $("seed-color").addEventListener("input", (e) => {
    state.seedHex = e.target.value;
    $("seed-hex").value = state.seedHex;
    recomputeSeedFromHex(); scheduleRender();
  });
  $("seed-hex").addEventListener("input", (e) => {
    const v = e.target.value.trim();
    if (hexToRgb(v)) {
      state.seedHex = v.startsWith("#") ? v : "#" + v;
      $("seed-color").value = state.seedHex.length === 7 ? state.seedHex : "#000000";
      recomputeSeedFromHex(); scheduleRender();
    }
  });

  document.querySelectorAll(".seg button[data-kind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seg button[data-kind]").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      state.kind = btn.dataset.kind;
      $("dark-chroma-field").hidden = state.kind !== "neutral";
      scheduleRender();
    });
  });

  $("chroma-scale").addEventListener("input", (e) => {
    state.chromaScale = parseFloat(e.target.value);
    $("chroma-scale-val").textContent = state.chromaScale.toFixed(2);
    scheduleRender();
  });
  $("hue-shift").addEventListener("input", (e) => {
    state.hueShift = parseFloat(e.target.value);
    $("hue-shift-val").textContent = `${state.hueShift}°`;
    scheduleRender();
  });
  $("high-contrast").addEventListener("change", (e) => {
    state.highContrast = e.target.checked; scheduleRender();
  });
  $("dark-chroma").addEventListener("input", (e) => {
    state.darkChromaRetention = parseFloat(e.target.value);
    $("dark-chroma-val").textContent = state.darkChromaRetention.toFixed(2);
    scheduleRender();
  });
  $("anchor").addEventListener("change", (e) => {
    state.anchor = parseInt(e.target.value, 10); scheduleRender();
  });

  const cmp = $("compare");
  for (const k of Object.keys(TAILWIND)) {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    cmp.appendChild(o);
  }
  cmp.addEventListener("change", (e) => { state.compare = e.target.value; scheduleRender(); });

  $("load-compare").addEventListener("click", () => {
    if (!state.compare) return;
    const ref = TAILWIND[state.compare];
    const at500 = ref[STEPS.indexOf(500)];
    // Kind guess: very low chroma => neutral
    const kind = at500.C < 0.05 ? "neutral" : "foreground";
    state.kind = kind;
    document.querySelectorAll(".seg button[data-kind]").forEach((b) => {
      b.classList.toggle("on", b.dataset.kind === kind);
    });
    $("dark-chroma-field").hidden = kind !== "neutral";

    state.seed = { L: at500.L, C: at500.C, H: at500.H };
    const hex = oklchToHex(state.seed);
    state.seedHex = hex;
    $("seed-color").value = hex;
    $("seed-hex").value = hex;
    state.anchor = 500;
    $("anchor").value = "500";
    state.chromaScale = 1.0;
    $("chroma-scale").value = "1";
    $("chroma-scale-val").textContent = "1.00";
    state.hueShift = 0;
    $("hue-shift").value = "0";
    $("hue-shift-val").textContent = "0°";
    scheduleRender();
  });

  // Tabs
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach((p) => {
        p.hidden = p.dataset.panel !== tab;
      });
    });
  });

  bindCopy("copy-csharp", "csharp");
  bindCopy("copy-tailwind", "tailwind");

  $("copy-link").addEventListener("click", async () => {
    syncUrl();
    try {
      await navigator.clipboard.writeText(window.location.href);
      const btn = $("copy-link");
      const prev = btn.textContent;
      btn.textContent = "Link copied";
      setTimeout(() => (btn.textContent = prev), 1400);
    } catch {}
  });
}

function bindCopy(btnId, sourceId) {
  $(btnId).addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($(sourceId).textContent);
      const btn = $(btnId);
      const prev = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = prev), 1200);
    } catch {}
  });
}

// ---- Init ----

applyStateFromUrl();
recomputeSeedFromHex();
bindInputs();
hydrateControlsFromState();
render();
