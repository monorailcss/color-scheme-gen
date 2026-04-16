import {
  hexToRgb, rgbToOklab, rgbToOklch, oklchToHex, formatOklch,
} from "./color.js";
import { generatePalette, STEPS } from "./palette.js";
import { TAILWIND } from "./tailwind-palettes.js";
import { COLOR_NAMES } from "./color-names.js";

const $ = (id) => document.getElementById(id);

const state = {
  seedHex: "#7e3e3e",
  seed: null,
  kind: "foreground",
  chromaScale: 1.0,
  hueShift: 0,
  highContrast: false,
  darkChromaRetention: 0.5,
  anchor: 500,
  compare: "",
  coordLightBg: 50,
  coordDarkBg: 950,
  activeTab: "swatches",
};

function currentName() {
  const rgb = hexToRgb(state.seedHex);
  return rgb ? nearestName(rgbToOklab(rgb)) : "brand";
}

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
  if (state.coordLightBg !== 50) p.set("lbg", String(state.coordLightBg));
  if (state.coordDarkBg !== 950) p.set("dbg", String(state.coordDarkBg));
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
  if (lbg === 50 || lbg === 100) state.coordLightBg = lbg;

  const dbg = parseInt(p.get("dbg"), 10);
  if (dbg === 900 || dbg === 950) state.coordDarkBg = dbg;
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
const wrapHue = (h) => ((h % 360) + 360) % 360;

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
    const target = which === "light" ? state.coordLightBg : state.coordDarkBg;
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

function currentPaletteOpts() {
  return {
    anchorStep: state.anchor,
    chromaScale: state.chromaScale,
    hueShift: state.hueShift,
    highContrast: state.highContrast,
    darkChromaRetention: state.darkChromaRetention,
  };
}

let lastMainName = "brand";
let lastMainStops = null;

function render() {
  const name = currentName();
  lastMainName = name;
  $("name-readout").textContent = name;

  const stops = generatePalette({ seed: state.seed, kind: state.kind, ...currentPaletteOpts() });
  lastMainStops = stops;

  renderSeedReadout();
  renderSwatches(stops);
  if (state.activeTab === "coordinating") renderCoordinating(name, stops);
  syncUrl();
}

function coordinatingExtras(scheme, mainName) {
  const roles = deriveCoordinatingRoles(state.seed, state.kind, scheme.offsets);
  const extras = [];
  const usedSlugs = new Set([slug(mainName)]);

  const addRole = (role, roleKind, label) => {
    const name = nearestName(rgbToOklab(hexToRgb(oklchToHex(role))));
    let base = slug(name), s = base, n = 2;
    while (usedSlugs.has(s)) { s = `${base}-${n++}`; }
    usedSlugs.add(s);
    const stops = generatePalette({ seed: role, kind: roleKind, ...currentPaletteOpts() });
    const entry = { name, slug: s, stops, label };
    extras.push(entry);
    return entry;
  };

  if (state.kind === "foreground") {
    const baseEntry = addRole(roles.base, "neutral", "base");
    const accentEntries = roles.accents.map((a, i) => addRole(a, "foreground", `accent ${i + 1}`));
    return { roles, extras, baseEntry, primName: mainName, accentEntries };
  }
  const primEntry = addRole(roles.primary, "foreground", "primary");
  const accentEntries = roles.accents.map((a, i) => addRole(a, "foreground", `accent ${i + 1}`));
  return { roles, extras, primEntry, baseName: mainName, accentEntries };
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
const COORD_PRIMARY_C = 0.22;
const COORD_NEUTRAL_FRACTION = 0.33;
const COORD_NEUTRAL_MIN = 0.02;
const COORD_NEUTRAL_MAX = 0.05;

function deriveCoordinatingRoles(seed, kind, offsets) {
  if (kind === "foreground") {
    const primary = { L: seed.L, C: seed.C, H: wrapHue(seed.H) };
    const baseC = clamp(seed.C * COORD_NEUTRAL_FRACTION, COORD_NEUTRAL_MIN, COORD_NEUTRAL_MAX);
    const base = { L: seed.L, C: baseC, H: primary.H };
    const accents = offsets.map((o) => ({ L: seed.L, C: seed.C, H: wrapHue(primary.H + o) }));
    return { base, primary, accents };
  }
  const base = { L: seed.L, C: seed.C, H: wrapHue(seed.H) };
  const primary = { L: seed.L, C: COORD_PRIMARY_C, H: wrapHue(seed.H + 180) };
  const accents = offsets.map((o) => ({ L: seed.L, C: COORD_PRIMARY_C, H: wrapHue(primary.H + o) }));
  return { base, primary, accents };
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
  const isLight = variant === "light";
  const bg = isLight ? STEPS.indexOf(state.coordLightBg) : STEPS.indexOf(state.coordDarkBg);
  const dir = isLight ? 1 : -1;
  const textI = isLight ? 9 : 0;
  const mutedI = isLight ? 6 : 4;
  const accentI = isLight ? 5 : 4;
  const accentHoverI = isLight ? 6 : 3;
  const onAccentI = isLight ? 0 : 10;
  const vars = {
    "--demo-bg": c(basePal, bg),
    "--demo-surface": c(basePal, bg + dir),
    "--demo-border": c(basePal, bg + dir * 2),
    "--demo-text": c(basePal, textI),
    "--demo-muted": c(basePal, mutedI),
    "--demo-accent": c(primPal, accentI),
    "--demo-accent-hover": c(primPal, accentHoverI),
    "--demo-on-accent": c(primPal, onAccentI),
  };
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  const accentChips = accentPals.map((pal, idx) => (
    `<span class="accent-chip" style="background:${c(pal, accentI)};color:${c(pal, onAccentI)}">Accent ${idx + 1}</span>`
  )).join("");
  const accentDot = accentPals[0] ? c(accentPals[0], accentI) : c(primPal, accentI);
  el.innerHTML = `
    <h3>${isLight ? "Light" : "Dark"} surface</h3>
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
  host.innerHTML = "";
  for (const scheme of COORD_SCHEMES) {
    const r = coordinatingExtras(scheme, mainName);
    // Reuse the user's tuned palette for whichever role matches the seed kind —
    // this way the coordinating preview always matches the main Swatches tab.
    const basePal = state.kind === "neutral" ? seedStops : r.baseEntry.stops;
    const primPal = state.kind === "foreground" ? seedStops : r.primEntry.stops;
    const accentPals = r.accentEntries.map((e) => e.stops);
    const baseName = state.kind === "neutral" ? mainName : r.baseEntry.name;
    const primName = state.kind === "foreground" ? mainName : r.primEntry.name;

    const csharpText = buildCsharp(mainName, seedStops, r.extras);
    const tailwindText = buildTailwind(mainName, seedStops, r.extras);

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
    bindCopyText(btnCs, () => csharpText, "Copy C#");
    bindCopyText(btnTw, () => tailwindText, "Copy Tailwind");
    actions.appendChild(btnCs);
    actions.appendChild(btnTw);
    header.appendChild(actions);
    card.appendChild(header);

    const roleWrap = document.createElement("div");
    roleWrap.className = "coord-roles";
    roleWrap.appendChild(coordRoleRow(`Base · ${baseName}`, r.roles.base, basePal));
    roleWrap.appendChild(coordRoleRow(`Primary · ${primName}`, r.roles.primary, primPal));
    r.roles.accents.forEach((a, i) => {
      roleWrap.appendChild(coordRoleRow(`Accent ${i + 1} · ${r.accentEntries[i].name}`, a, accentPals[i]));
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
    const which = seg.dataset.coordBg;
    seg.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        seg.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
        const step = parseInt(btn.dataset.step, 10);
        if (which === "light") state.coordLightBg = step;
        else state.coordDarkBg = step;
        scheduleRender();
      });
    });
  });

  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      const tab = btn.dataset.tab;
      state.activeTab = tab;
      document.querySelectorAll(".tab-panel").forEach((p) => {
        p.hidden = p.dataset.panel !== tab;
      });
      if (tab === "coordinating" && lastMainStops) {
        renderCoordinating(lastMainName, lastMainStops);
      }
    });
  });

  bindCopyText($("copy-csharp"), () => buildCsharp(lastMainName, lastMainStops, []), "Copy C#");
  bindCopyText($("copy-tailwind"), () => buildTailwind(lastMainName, lastMainStops, []), "Copy Tailwind");

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

function bindCopyText(btn, getText, restoreLabel) {
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(getText());
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
