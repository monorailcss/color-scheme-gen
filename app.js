import {
  hexToRgb, rgbToOklab, rgbToOklch, oklchToHex, formatOklch,
} from "./color.js";
import { generatePalette, STEPS, anchorIndex } from "./palette.js";
import { TAILWIND } from "./tailwind-palettes.js";
import { COLOR_NAMES } from "./color-names.js";

const $ = (id) => document.getElementById(id);

const state = {
  seedHex: "#7e3e3e",
  seed: null,        // OKLCH
  kind: "foreground",
  chromaScale: 1.0,
  hueShift: 0,
  highContrast: false,
  darkChromaRetention: 0.5,
  anchor: 500,
  compare: "",
  coordLightBg: 0,   // index into palette: 0=step 50, 1=step 100
  coordDarkBg: 10,   // index: 9=step 900, 10=step 950
};

// Palette name is always derived from the seed color — no manual override.
function currentName() {
  const rgb = hexToRgb(state.seedHex);
  return rgb ? nearestName(rgbToOklab(rgb)) : "brand";
}

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
  if (state.chromaScale !== 1.0) p.set("cs", String(state.chromaScale));
  if (state.hueShift !== 0) p.set("hs", String(state.hueShift));
  if (state.highContrast) p.set("hc", "1");
  if (state.kind === "neutral" && state.darkChromaRetention !== 0.5)
    p.set("dcr", String(state.darkChromaRetention));
  if (state.anchor !== 500) p.set("a", String(state.anchor));
  if (state.compare) p.set("cmp", state.compare);
  if (state.coordLightBg !== 0) p.set("lbg", String(STEPS[state.coordLightBg]));
  if (state.coordDarkBg !== 10) p.set("dbg", String(STEPS[state.coordDarkBg]));
  return p.toString();
}

function applyStateFromUrl() {
  const p = new URLSearchParams(window.location.search);
  if (!p.toString()) return;

  const s = p.get("s");
  if (s && /^[0-9a-fA-F]{6}$/.test(s)) state.seedHex = "#" + s.toLowerCase();

  const k = p.get("k");
  if (k === "n") state.kind = "neutral";

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

  const lbg = parseInt(p.get("lbg"), 10);
  if (lbg === 50 || lbg === 100) state.coordLightBg = STEPS.indexOf(lbg);

  const dbg = parseInt(p.get("dbg"), 10);
  if (dbg === 900 || dbg === 950) state.coordDarkBg = STEPS.indexOf(dbg);
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function syncUrl() {
  const qs = encodeStateToUrl();
  const url = `${window.location.pathname}${qs ? "?" + qs : ""}${window.location.hash}`;
  window.history.replaceState(null, "", url);
}

function hydrateControlsFromState() {
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
  document.querySelectorAll(".coord-seg").forEach((seg) => {
    const which = seg.dataset.coordBg;
    const target = which === "light" ? STEPS[state.coordLightBg] : STEPS[state.coordDarkBg];
    seg.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("on", parseInt(b.dataset.step, 10) === target);
    });
  });
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

// Cached outputs for the main (seed-only) palette, read by the Swatches-tab
// copy buttons. Coord-card copy buttons build their own per-scheme strings.
let mainCsharp = "";
let mainTailwind = "";

function render() {
  const name = currentName();
  $("name-readout").textContent = name;

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
  mainCsharp = buildCsharp(name, stops, []);
  mainTailwind = buildTailwind(name, stops, []);
  renderCoordinating(name, stops);
  syncUrl();
}

// Build { name, slug, stops, label } role palettes for a given scheme, with
// slug collision avoidance against the main palette.
function coordinatingExtras(seedStops, scheme, mainName) {
  const roles = deriveCoordinatingRoles(state.seed, state.kind, scheme.offsets);
  const out = [];
  const usedSlugs = new Set([slug(mainName)]);

  const addRole = (role, roleKind, label) => {
    const hex = oklchToHex(role);
    const lab = rgbToOklab(hexToRgb(hex));
    const name = nearestName(lab);
    let base = slug(name), s = base, n = 2;
    while (usedSlugs.has(s)) { s = `${base}-${n++}`; }
    usedSlugs.add(s);
    const stops = rolePalette(role, roleKind);
    out.push({ name, slug: s, stops, label });
  };

  if (state.kind === "foreground") {
    addRole(roles.base, "neutral", "base");
    roles.accents.forEach((a, i) => addRole(a, "foreground", `accent ${i + 1}`));
  } else {
    addRole(roles.primary, "foreground", "primary");
    roles.accents.forEach((a, i) => addRole(a, "foreground", `accent ${i + 1}`));
  }
  return { roles, extras: out };
}

const COORD_SCHEMES = [
  { id: "complementary", label: "Complementary",       offsets: [180] },
  { id: "split",         label: "Split-complementary", offsets: [150, 210] },
  { id: "triadic",       label: "Triadic",             offsets: [120, 240] },
  { id: "analogous",     label: "Analogous",           offsets: [-30, 30] },
];

// Target chromas were tuned against Tailwind 500-steps — slate/stone sit
// around C≈0.015–0.03; vivid accents around C≈0.2. Using the raw seed chroma
// washed out both ends (nothing from a near-gray seed, too little tint when
// deriving a neutral from a saturated primary).
const COORD_PRIMARY_C = 0.22;        // target chroma for a primary generated from a neutral seed
const COORD_NEUTRAL_FRACTION = 0.33; // how much of the primary's chroma to carry into a derived neutral
const COORD_NEUTRAL_MIN = 0.02;
const COORD_NEUTRAL_MAX = 0.05;

function deriveCoordinatingRoles(seed, kind, offsets) {
  const wrap = (h) => ((h % 360) + 360) % 360;
  const clamp01 = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  if (kind === "foreground") {
    const primary = { L: seed.L, C: seed.C, H: wrap(seed.H) };
    const baseC = clamp01(seed.C * COORD_NEUTRAL_FRACTION, COORD_NEUTRAL_MIN, COORD_NEUTRAL_MAX);
    const base = { L: seed.L, C: baseC, H: primary.H };
    const accents = offsets.map((o) => ({ L: seed.L, C: seed.C, H: wrap(primary.H + o) }));
    return { base, primary, accents };
  }
  const base = { L: seed.L, C: seed.C, H: wrap(seed.H) };
  const primary = { L: seed.L, C: COORD_PRIMARY_C, H: wrap(seed.H + 180) };
  const accents = offsets.map((o) => ({ L: seed.L, C: COORD_PRIMARY_C, H: wrap(primary.H + o) }));
  return { base, primary, accents };
}

function rolePalette(role, roleKind) {
  return generatePalette({
    seed: role,
    kind: roleKind,
    anchorStep: state.anchor,
    chromaScale: state.chromaScale,
    hueShift: state.hueShift,
    highContrast: state.highContrast,
    darkChromaRetention: state.darkChromaRetention,
  });
}

function coordStripEl(stops) {
  const el = document.createElement("div");
  el.className = "coord-strip";
  for (const s of stops) {
    const chip = document.createElement("div");
    chip.className = "coord-chip";
    chip.style.background = formatOklch(s);
    chip.title = `${s.step} · ${oklchToHex(s)}`;
    el.appendChild(chip);
  }
  return el;
}

function coordRoleRow(label, role, stops) {
  const row = document.createElement("div");
  row.className = "coord-role";
  const head = document.createElement("div");
  head.className = "coord-role-head";
  head.innerHTML = `<span class="coord-role-label">${label}</span>
    <span class="coord-role-meta">${oklchToHex(role)} · H${Math.round(role.H)}°</span>`;
  row.appendChild(head);
  row.appendChild(coordStripEl(stops));
  return row;
}

function coordDemoCard(basePal, primPal, accentPals, variant) {
  const c = (pal, i) => formatOklch(pal[i]);
  const el = document.createElement("div");
  el.className = `demo-card ${variant}`;
  const lbg = state.coordLightBg;  // 0 (step 50) or 1 (step 100)
  const dbg = state.coordDarkBg;   // 9 (step 900) or 10 (step 950)
  const vars = variant === "light" ? {
    "--demo-bg": c(basePal, lbg),
    "--demo-surface": c(basePal, lbg + 1),
    "--demo-border": c(basePal, lbg + 2),
    "--demo-text": c(basePal, 9),
    "--demo-muted": c(basePal, 6),
    "--demo-accent": c(primPal, 5),
    "--demo-accent-hover": c(primPal, 6),
    "--demo-on-accent": c(primPal, 0),
  } : {
    "--demo-bg": c(basePal, dbg),
    "--demo-surface": c(basePal, dbg - 1),
    "--demo-border": c(basePal, dbg - 2),
    "--demo-text": c(basePal, 0),
    "--demo-muted": c(basePal, 4),
    "--demo-accent": c(primPal, 4),
    "--demo-accent-hover": c(primPal, 3),
    "--demo-on-accent": c(primPal, 10),
  };
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  const swatchI = variant === "light" ? 5 : 4;
  const onI = variant === "light" ? 0 : 10;
  const accentChips = accentPals.map((pal, idx) => (
    `<span class="accent-chip" style="background:${c(pal, swatchI)};color:${c(pal, onI)}">Accent ${idx + 1}</span>`
  )).join("");
  const accentDot = accentPals[0] ? c(accentPals[0], swatchI) : c(primPal, swatchI);
  el.innerHTML = `
    <h3>${variant === "light" ? "Light" : "Dark"} surface</h3>
    <p>The quick brown fox jumps over the lazy dog. Pair a base with a primary; accents add emphasis — find what reads well together at a glance.</p>
    <div class="surface">
      <div class="row">
        <span class="tag">New</span>
        <strong>Feature title</strong>
        <span class="dot" style="background:${accentDot}"></span>
      </div>
      <p class="muted">A short supporting line of copy in a muted tone. <a href="#">Learn more →</a></p>
      <div class="row code-row">
        <span class="chip">const x = 42;</span>
        <span class="chip">theme.500</span>
      </div>
    </div>
    <div class="divider"></div>
    <div class="row">
      <button class="primary">Primary action</button>
      <button class="secondary">Secondary</button>
      ${accentChips}
    </div>`;
  return el;
}

function renderCoordinating(mainName, seedStops) {
  const host = $("coordinating");
  if (!host) return;
  host.innerHTML = "";
  for (const scheme of COORD_SCHEMES) {
    const { roles, extras } = coordinatingExtras(seedStops, scheme, mainName);
    // Reuse the user's tuned palette for whichever role matches the seed kind —
    // this way the coordinating preview always matches the main Swatches tab.
    const basePal = state.kind === "neutral" ? seedStops
      : extras.find((e) => e.label === "base").stops;
    const primPal = state.kind === "foreground" ? seedStops
      : extras.find((e) => e.label === "primary").stops;
    const accentPals = extras.filter((e) => e.label.startsWith("accent")).map((e) => e.stops);

    const csharpText = buildCsharp(mainName, seedStops, extras);
    const tailwindText = buildTailwind(mainName, seedStops, extras);

    const card = document.createElement("div");
    card.className = "coord-card";

    const header = document.createElement("div");
    header.className = "coord-card-head";
    header.innerHTML = `<div class="coord-card-title">
        <h3>${scheme.label}</h3>
        <span class="coord-offsets">${scheme.offsets.map((o) => (o > 0 ? "+" : "") + o + "°").join(", ")}</span>
      </div>`;
    const actions = document.createElement("div");
    actions.className = "coord-card-actions";
    const btnCs = document.createElement("button");
    btnCs.type = "button"; btnCs.className = "btn-secondary"; btnCs.textContent = "Copy C#";
    const btnTw = document.createElement("button");
    btnTw.type = "button"; btnTw.className = "btn-secondary"; btnTw.textContent = "Copy Tailwind";
    bindCopyText(btnCs, csharpText, "Copy C#");
    bindCopyText(btnTw, tailwindText, "Copy Tailwind");
    actions.appendChild(btnCs);
    actions.appendChild(btnTw);
    header.appendChild(actions);
    card.appendChild(header);

    const roleWrap = document.createElement("div");
    roleWrap.className = "coord-roles";
    const baseLabel = state.kind === "neutral" ? `Base · ${mainName}` : `Base · ${extras.find((e) => e.label === "base").name}`;
    const primLabel = state.kind === "foreground" ? `Primary · ${mainName}` : `Primary · ${extras.find((e) => e.label === "primary").name}`;
    roleWrap.appendChild(coordRoleRow(baseLabel, roles.base, basePal));
    roleWrap.appendChild(coordRoleRow(primLabel, roles.primary, primPal));
    const accentExtras = extras.filter((e) => e.label.startsWith("accent"));
    roles.accents.forEach((a, i) => {
      roleWrap.appendChild(coordRoleRow(`Accent ${i + 1} · ${accentExtras[i].name}`, a, accentPals[i]));
    });
    card.appendChild(roleWrap);

    const demo = document.createElement("div");
    demo.className = "coord-demo";
    demo.appendChild(coordDemoCard(basePal, primPal, accentPals, "light"));
    demo.appendChild(coordDemoCard(basePal, primPal, accentPals, "dark"));
    card.appendChild(demo);

    host.appendChild(card);
  }
}

// Tailwind v4 uses decimal L (0..1), trailing zeros trimmed.
function formatOklchTheme({ L, C, H }) {
  const fmt = (x, d) => {
    const s = (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);
    return s.replace(/\.?0+$/, "") || "0";
  };
  return `oklch(${fmt(L, 3)} ${fmt(C, 3)} ${fmt(H, 3)})`;
}

function tailwindLinesFor(slugName, stops) {
  return stops.map((stop) => `  --color-${slugName}-${stop.step}: ${formatOklchTheme(stop)};`);
}
function buildTailwind(name, stops, extras) {
  const lines = ["@theme {"];
  lines.push(`  /* ${name} */`);
  lines.push(...tailwindLinesFor(slug(name), stops));
  for (const p of extras) {
    lines.push("");
    lines.push(`  /* ${p.label}: ${p.name} */`);
    lines.push(...tailwindLinesFor(p.slug, p.stops));
  }
  lines.push("}");
  return lines.join("\n");
}

function renderSeedReadout() {
  if (!state.seed) return;
  $("seed-oklch").textContent = formatOklch(state.seed);
}

function swatchEl(stop, deltaStr) {
  const hex = oklchToHex(stop);
  const css = formatOklch(stop);
  const el = document.createElement("div");
  el.className = "swatch";
  el.innerHTML = `
    <div class="chip" style="background:${css}"></div>
    <div class="meta">
      <span class="step">${stop.step}</span>
      <span class="oklch" title="${css}">${css}</span>
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

function csharpBlockFor(name, slugName, stops, label) {
  const tc = titleCase(name);
  const header = label ? `// Colors - ${tc} (${label})` : `// Colors - ${tc}`;
  const lines = [header];
  for (const stop of stops) {
    lines.push(`builder.Add("--color-${slugName}-${stop.step}", "${formatOklch(stop)}");`);
  }
  lines.push("");
  lines.push("/// <summary>");
  lines.push(`/// Represents the color name "${slugName}".`);
  lines.push("/// </summary>");
  lines.push(`public const string ${tc} = "${slugName}";`);
  return lines.join("\n");
}
function buildCsharp(name, stops, extras) {
  const blocks = [csharpBlockFor(name, slug(name), stops)];
  for (const p of extras) blocks.push(csharpBlockFor(p.name, p.slug, p.stops, p.label));
  return blocks.join("\n\n");
}

// ---- Inputs ----

let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 50);
}

function bindInputs() {
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

  document.querySelectorAll(".coord-seg").forEach((seg) => {
    const which = seg.dataset.coordBg; // "light" | "dark"
    seg.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        seg.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
        const step = parseInt(btn.dataset.step, 10);
        const idx = STEPS.indexOf(step);
        if (which === "light") state.coordLightBg = idx;
        else state.coordDarkBg = idx;
        scheduleRender();
      });
    });
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

  bindCopyText($("copy-csharp"), () => mainCsharp, "Copy C#");
  bindCopyText($("copy-tailwind"), () => mainTailwind, "Copy Tailwind");

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

// `source` can be a string or a 0-arg function returning a string (for late
// binding to module-level caches that refresh each render).
function bindCopyText(btn, source, restoreLabel) {
  btn.addEventListener("click", async () => {
    const text = typeof source === "function" ? source() : source;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = restoreLabel), 1200);
    } catch {}
  });
}

// ---- Init ----

applyStateFromUrl();
recomputeSeedFromHex();
bindInputs();
hydrateControlsFromState();
render();
