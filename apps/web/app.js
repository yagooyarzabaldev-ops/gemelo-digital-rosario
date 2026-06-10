/* Gemelo Digital Rosario — CityPulse 4D visual shell.
 *
 * Fixture-driven frontend: everything rendered here comes from one prepared
 * layer-snapshot document (contracts/layer-snapshot.schema.json). The browser
 * never calls public APIs directly.
 *
 * The map is a stylized canvas scene of the region (schematic Paraná river,
 * city anchors). It will be replaced by MapLibre GL + deck.gl in a later
 * iteration without changing the snapshot contract.
 */
"use strict";

const SNAPSHOT_URL = "../../data/fixtures/layer-snapshot.sample.json";

const LAYER_STYLE = {
  weather: { color: "#4fd2ff", shape: "circle", glyph: "●" },
  air_quality: { color: "#34d399", shape: "square", glyph: "■" },
  fires: { color: "#fb923c", shape: "triangle", glyph: "▲" },
  earthquakes: { color: "#fb7185", shape: "ring", glyph: "◎" },
  pois: { color: "#c4a5ff", shape: "diamond", glyph: "◆" },
};

const AQ_CATEGORY_COLORS = {
  good: "#34d399",
  moderate: "#fbbf24",
  unhealthy_sensitive: "#fb923c",
};

// Schematic basemap geometry (WGS84). Placeholder until a real basemap lands.
const RIVER_PARANA = [
  [-60.755, -32.580], [-60.745, -32.650], [-60.730, -32.720], [-60.705, -32.780],
  [-60.675, -32.840], [-60.650, -32.890], [-60.625, -32.940], [-60.605, -32.990],
  [-60.585, -33.040], [-60.520, -33.100], [-60.440, -33.160], [-60.360, -33.215],
  [-60.300, -33.260],
];

// Secondary delta channel east of the main course, to suggest the island maze.
const RIVER_BRANCH = [
  [-60.700, -32.700], [-60.640, -32.760], [-60.590, -32.840], [-60.555, -32.930],
  [-60.540, -33.010], [-60.480, -33.090], [-60.400, -33.160],
];

const CITIES = [
  { name: "Rosario", lon: -60.6505, lat: -32.9468, major: true },
  { name: "San Lorenzo", lon: -60.7333, lat: -32.7459, major: true },
  { name: "Capitán Bermúdez", lon: -60.7150, lat: -32.8210 },
  { name: "Granadero Baigorria", lon: -60.6794, lat: -32.8569 },
  { name: "Funes", lon: -60.8103, lat: -32.9211 },
  { name: "Roldán", lon: -60.9100, lat: -32.8990 },
  { name: "V. Gdor. Gálvez", lon: -60.6044, lat: -33.0256 },
  { name: "Arroyo Seco", lon: -60.5100, lat: -33.1550, major: true },
  { name: "Villa Constitución", lon: -60.3297, lat: -33.2329, major: true },
];

const state = {
  snapshot: null,
  enabled: new Set(Object.keys(LAYER_STYLE)),
  timeSteps: [],
  timeIndex: 0,
  selected: null, // { layerId, featureId }
  hitTargets: [], // recomputed on every frame
  playTimer: null,
};

const $ = (id) => document.getElementById(id);
const canvas = $("map");
const ctx = canvas.getContext("2d");

/* ================= data loading ================= */

async function init() {
  try {
    const res = await fetch(SNAPSHOT_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} loading snapshot`);
    state.snapshot = await res.json();
  } catch (err) {
    const el = $("load-error");
    el.hidden = false;
    el.textContent =
      "Could not load the layer snapshot.\n\n" +
      `${err.message}\n\n` +
      "Serve the repository root over HTTP (file:// will not work):\n" +
      "node apps/web/serve.mjs\n" +
      "then open http://localhost:8080/apps/web/";
    return;
  }
  buildTimeSteps();
  renderModeBanner();
  renderSnapshotMeta();
  renderLayerToggles();
  renderSourceStatus();
  renderLegend();
  bindTimebar();
  bindCanvas();
  refreshPanels();
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  requestAnimationFrame(frame);
}

function buildTimeSteps() {
  const { start, end, step_minutes } = state.snapshot.time_range;
  const steps = [];
  for (let t = Date.parse(start); t <= Date.parse(end); t += step_minutes * 60000) {
    steps.push(t);
  }
  state.timeSteps = steps;
  state.timeIndex = steps.length - 1; // open on the most recent step
  const slider = $("time-slider");
  slider.max = String(steps.length - 1);
  slider.value = String(state.timeIndex);
}

/* ================= header / panels ================= */

function renderModeBanner() {
  const { mode, disclaimer } = state.snapshot;
  const el = $("mode-banner");
  el.hidden = false;
  el.classList.add(mode);
  el.title = disclaimer ?? "";
  el.innerHTML =
    mode === "fixture"
      ? `<span class="pill-dot"></span>Fixture mode<span class="pill-sub">· sample data, not live</span>`
      : `<span class="pill-dot"></span>Live mode`;
}

function renderSnapshotMeta() {
  const s = state.snapshot;
  $("snapshot-meta").innerHTML =
    `snapshot <strong>${esc(s.snapshot_id)}</strong> · contract v${esc(s.contract_version)}` +
    `<br>generated ${fmtTime(Date.parse(s.generated_at))}`;
}

function renderLayerToggles() {
  const ul = $("layer-toggles");
  ul.innerHTML = "";
  for (const [layerId, layer] of Object.entries(state.snapshot.layers)) {
    const style = LAYER_STYLE[layerId] ?? { color: "#8c9cc0", glyph: "●" };
    const li = document.createElement("li");
    li.className = "layer-item";
    li.style.setProperty("--c", style.color);
    li.innerHTML =
      `<span class="layer-icon" style="--c:${style.color}">${style.glyph}</span>` +
      `<div class="layer-info">` +
      `<span class="layer-name">${esc(layer.label)}</span>` +
      `<span class="layer-sub">${layer.features.length} feature${layer.features.length === 1 ? "" : "s"}` +
      ` <span class="status-chip ${esc(layer.status)}">${esc(layer.status.replace("_", " "))}</span></span>` +
      `</div>` +
      `<label class="switch"><input type="checkbox" checked data-layer="${esc(layerId)}"><span class="knob"></span></label>`;
    li.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) state.enabled.add(layerId);
      else state.enabled.delete(layerId);
      li.classList.toggle("off", !e.target.checked);
      refreshPanels();
    });
    ul.appendChild(li);
  }
}

function renderSourceStatus() {
  const ul = $("source-status");
  ul.innerHTML = "";
  for (const src of state.snapshot.source_status) {
    const li = document.createElement("li");
    li.className = `source-card s-${esc(src.status)}`;
    const freshness = src.last_success_at
      ? `Last success ${fmtAgo(Date.parse(src.last_success_at))}`
      : "Never succeeded";
    li.innerHTML =
      `<div class="source-head"><span class="source-name">${esc(src.name)}</span>` +
      `<span class="badge ${esc(src.status)}">${esc(src.status.replace("_", " "))}</span></div>` +
      `<div class="source-meta">${esc(freshness)}` +
      ` · <span class="badge ${esc(src.mode)}">${esc(src.mode)}</span>` +
      (src.license ? `<br>${esc(src.license)}` : "") + `</div>` +
      (src.last_error ? `<div class="source-error-msg">⚠ ${esc(src.last_error)}</div>` : "");
    ul.appendChild(li);
  }
  const names = state.snapshot.source_status
    .filter((s) => s.url)
    .map((s) => s.name)
    .join(" · ");
  $("map-attribution").textContent =
    `${state.snapshot.mode === "fixture" ? "fixture data · " : ""}sources: ${names}`;
}

function renderLegend() {
  $("map-legend").innerHTML = Object.entries(state.snapshot.layers)
    .map(([layerId, layer]) => {
      const style = LAYER_STYLE[layerId] ?? { color: "#8c9cc0", glyph: "●" };
      return `<span class="legend-item"><span class="glyph" style="color:${style.color}">${style.glyph}</span>${esc(layer.label)}</span>`;
    })
    .join("");
}

/* ================= time bar ================= */

function bindTimebar() {
  const slider = $("time-slider");
  slider.addEventListener("input", () => {
    state.timeIndex = Number(slider.value);
    stopPlayback();
    refreshPanels();
  });
  $("play-btn").addEventListener("click", () => {
    if (state.playTimer) stopPlayback();
    else startPlayback();
  });
  $("time-range-label").textContent =
    `window ${fmtTime(state.timeSteps[0])} → ${fmtTime(state.timeSteps.at(-1))}`;
  const ticks = $("time-ticks");
  ticks.innerHTML = state.timeSteps.map(() => "<span></span>").join("");
}

function startPlayback() {
  $("play-btn").textContent = "⏸";
  state.playTimer = setInterval(() => {
    state.timeIndex = (state.timeIndex + 1) % state.timeSteps.length;
    $("time-slider").value = String(state.timeIndex);
    refreshPanels();
  }, 1100);
}

function stopPlayback() {
  if (state.playTimer) clearInterval(state.playTimer);
  state.playTimer = null;
  $("play-btn").textContent = "▶";
}

function updateTimeUI() {
  const t = currentTime();
  $("time-label").textContent = fmtTime(t);
  const pct = state.timeSteps.length > 1
    ? (state.timeIndex / (state.timeSteps.length - 1)) * 100
    : 100;
  $("time-slider").style.setProperty("--progress", pct + "%");
  [...$("time-ticks").children].forEach((el, i) =>
    el.classList.toggle("active", i <= state.timeIndex));
}

/* ================= projection ================= */

function makeProjector() {
  const [west, south, east, north] = state.snapshot.region.bbox;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const pad = 48;
  const midLat = (south + north) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180); // shrink lon span at this latitude
  const spanX = (east - west) * kx;
  const spanY = north - south;
  const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const offX = (w - spanX * scale) / 2;
  const offY = (h - spanY * scale) / 2;
  return (lon, lat) => [
    offX + (lon - west) * kx * scale,
    offY + (north - lat) * scale,
  ];
}

/* ================= time selection ================= */

function currentTime() {
  return state.timeSteps[state.timeIndex];
}

// Returns the observation a feature should show at time t, or null.
function observationAt(feature, layerKind, t) {
  if (layerKind === "static") return feature.observations[0] ?? null;
  let best = null;
  for (const obs of feature.observations) {
    const ot = Date.parse(obs.observed_at);
    if (ot <= t && (!best || ot > Date.parse(best.observed_at))) best = obs;
  }
  return best;
}

/* ================= render loop ================= */

function frame(nowMs) {
  if (state.snapshot) drawCanvas(nowMs);
  requestAnimationFrame(frame);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// DOM panels that depend on the selected time or selection.
function refreshPanels() {
  updateTimeUI();
  renderEmptyNotes(currentTime());
  renderInspector(currentTime());
}

function drawCanvas(nowMs) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const project = makeProjector();
  const t = currentTime();
  state.hitTargets = [];

  // terrain base: navy land with a soft regional highlight
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#13203c");
  grad.addColorStop(1, "#0d1528");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const [rx, ry] = project(-60.65, -32.95);
  const halo = ctx.createRadialGradient(rx, ry, 0, rx, ry, Math.max(w, h) * 0.5);
  halo.addColorStop(0, "rgba(64, 110, 190, 0.14)");
  halo.addColorStop(1, "rgba(64, 110, 190, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  drawGrid(project);
  drawRiver(project);
  drawCities(project);
  drawLayers(project, t, nowMs);
  drawSelectionRing(project, nowMs);
}

function drawGrid(project) {
  const [west, south, east, north] = state.snapshot.region.bbox;
  ctx.strokeStyle = "rgba(130, 165, 220, 0.08)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(130, 165, 220, 0.3)";
  ctx.font = "10px system-ui";
  for (let lon = Math.ceil(west * 10) / 10; lon <= east; lon += 0.1) {
    const [x1, y1] = project(lon, south);
    const [x2, y2] = project(lon, north);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.fillText(lon.toFixed(1) + "°", x2 + 3, y2 + 12);
  }
  for (let lat = Math.ceil(south * 10) / 10; lat <= north; lat += 0.1) {
    const [x1, y1] = project(west, lat);
    const [x2, y2] = project(east, lat);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.fillText(lat.toFixed(1) + "°", x1 + 3, y1 - 4);
  }
}

function drawRiver(project) {
  const main = RIVER_PARANA.map(([lon, lat]) => project(lon, lat));
  const branch = RIVER_BRANCH.map(([lon, lat]) => project(lon, lat));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // glow halo around the water
  ctx.save();
  ctx.shadowColor = "rgba(80, 160, 255, 0.55)";
  ctx.shadowBlur = 22;
  ctx.strokeStyle = "rgba(34, 80, 140, 0.95)";
  ctx.lineWidth = 30;
  pathThrough(main); ctx.stroke();
  ctx.lineWidth = 12;
  ctx.strokeStyle = "rgba(34, 80, 140, 0.7)";
  pathThrough(branch); ctx.stroke();
  ctx.restore();

  // bright channel cores
  ctx.strokeStyle = "rgba(110, 185, 250, 0.75)";
  ctx.lineWidth = 9;
  pathThrough(main); ctx.stroke();
  ctx.strokeStyle = "rgba(110, 185, 250, 0.4)";
  ctx.lineWidth = 4;
  pathThrough(branch); ctx.stroke();

  // shimmering centerline
  ctx.strokeStyle = "rgba(190, 226, 255, 0.5)";
  ctx.lineWidth = 1.6;
  ctx.setLineDash([10, 12]);
  pathThrough(main); ctx.stroke();
  ctx.setLineDash([]);

  // label along the river
  const [lx, ly] = project(-60.52, -33.05);
  ctx.save();
  ctx.translate(lx, ly);
  ctx.rotate(0.55);
  ctx.font = "italic 600 14px Georgia, serif";
  ctx.fillStyle = "rgba(160, 205, 250, 0.85)";
  ctx.fillText("Río Paraná", 6, -16);
  ctx.restore();
}

function pathThrough(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
}

function drawCities(project) {
  for (const c of CITIES) {
    const [x, y] = project(c.lon, c.lat);
    // anchor dot (+ ring for major cities)
    ctx.fillStyle = c.major ? "#eaf1fc" : "rgba(214, 226, 245, 0.7)";
    ctx.beginPath();
    ctx.arc(x, y, c.major ? 3.6 : 2.4, 0, Math.PI * 2);
    ctx.fill();
    if (c.major) {
      ctx.strokeStyle = "rgba(234, 241, 252, 0.4)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    // label with dark halo for readability
    ctx.font = c.major ? "700 13px 'Segoe UI', system-ui" : "500 11.5px 'Segoe UI', system-ui";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(10, 16, 30, 0.85)";
    ctx.strokeText(c.name, x + 10, y + 4);
    ctx.fillStyle = c.major ? "#eaf1fc" : "#b9c7e0";
    ctx.fillText(c.name, x + 10, y + 4);
  }
}

function drawLayers(project, t, nowMs) {
  for (const [layerId, layer] of Object.entries(state.snapshot.layers)) {
    if (!state.enabled.has(layerId)) continue;
    const style = LAYER_STYLE[layerId] ?? { color: "#8c9cc0", shape: "circle" };
    let i = 0;
    for (const feature of layer.features) {
      const obs = observationAt(feature, layer.kind, t);
      if (!obs) continue; // nothing to show at/before this time
      const [x, y] = project(feature.lon, feature.lat);
      const age = t - Date.parse(obs.observed_at);
      // events older than two slider steps fade out but stay inspectable
      const faded =
        layer.kind === "events" &&
        age > 2 * state.snapshot.time_range.step_minutes * 60000;
      ctx.globalAlpha = faded ? 0.45 : 1;
      const r = drawLayerMarker(layerId, style, x, y, obs, nowMs, i);
      ctx.globalAlpha = 1;
      state.hitTargets.push({ x, y, r: Math.max(r, 14), layerId, feature, obs });
      i++;
    }
  }
}

// Draws the marker for one feature; returns its hit radius.
function drawLayerMarker(layerId, style, x, y, obs, nowMs, i) {
  const v = obs.values;
  switch (layerId) {
    case "weather": {
      softGlow(x, y, 26, style.color, 0.20);
      dot(x, y, 6.5, style.color);
      chip(x + 12, y - 22, `${v.temperature_c}°C`, style.color);
      return 16;
    }
    case "air_quality": {
      const c = AQ_CATEGORY_COLORS[v.category] ?? style.color;
      softGlow(x, y, 24, c, 0.18);
      roundedSquare(x, y, 7, c);
      chip(x + 12, y + 10, `PM2.5 ${v.pm2_5_ugm3}`, c);
      return 16;
    }
    case "fires": {
      // subtle pulse: breathing glow ring, phase-shifted per feature
      const pulse = (Math.sin(nowMs / 480 + i * 1.7) + 1) / 2; // 0..1
      softGlow(x, y, 18 + pulse * 9, "#fb923c", 0.16 + pulse * 0.14);
      ctx.strokeStyle = `rgba(251, 146, 60, ${0.35 + pulse * 0.4})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, 12 + pulse * 5, 0, Math.PI * 2);
      ctx.stroke();
      triangle(x, y, 8, "#fb923c");
      return 17;
    }
    case "earthquakes": {
      const r = 7 + Math.min(12, (v.magnitude ?? 0) * 2);
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      dot(x, y, 3.5, style.color);
      return r + 4;
    }
    case "pois":
    default: {
      diamond(x, y, 7.5, style.color);
      return 13;
    }
  }
}

/* ----- marker primitives ----- */

function softGlow(x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexWithAlpha(color, alpha));
  g.addColorStop(1, hexWithAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function dot(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(10, 16, 30, 0.9)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function roundedSquare(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(10, 16, 30, 0.9)";
  ctx.lineWidth = 1.6;
  roundRectPath(x - r, y - r, r * 2, r * 2, 3);
  ctx.fill();
  ctx.stroke();
}

function triangle(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(10, 16, 30, 0.9)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y + r * 0.85);
  ctx.lineTo(x - r, y + r * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function diamond(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(10, 16, 30, 0.9)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Small value card next to a marker.
function chip(x, y, text, color) {
  ctx.font = "700 11px 'Segoe UI', system-ui";
  const tw = ctx.measureText(text).width;
  const padX = 7, h = 18;
  roundRectPath(x, y, tw + padX * 2, h, 6);
  ctx.fillStyle = "rgba(12, 18, 34, 0.88)";
  ctx.fill();
  ctx.strokeStyle = hexWithAlpha(color, 0.55);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, x + padX, y + 13);
}

function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexWithAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function drawSelectionRing(project, nowMs) {
  const sel = findSelected();
  if (!sel) return;
  const [x, y] = project(sel.feature.lon, sel.feature.lat);
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 4]);
  ctx.lineDashOffset = -(nowMs / 40) % 9; // slow rotation
  ctx.shadowColor = "rgba(79, 210, 255, 0.8)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x, y, 19, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/* ================= empty / error states ================= */

function renderEmptyNotes(t) {
  const host = $("map-empty-notes");
  host.innerHTML = "";
  for (const [layerId, layer] of Object.entries(state.snapshot.layers)) {
    if (!state.enabled.has(layerId)) continue;
    const visible = layer.features.filter((f) => observationAt(f, layer.kind, t));
    if (visible.length > 0 && layer.status !== "stale" && layer.status !== "error") continue;

    let kind = "info", icon = "✓", title = layer.label, body = "";
    if (layer.status === "error") {
      kind = "error"; icon = "⚠";
      body = "Source error — no trusted data to display.";
    } else if (layer.status === "stale") {
      kind = "stale"; icon = "🕒";
      body = `Showing last known data · source stale since ${fmtTime(Date.parse(layer.last_updated))}.`;
      if (visible.length === 0) body += " Nothing in the selected window.";
    } else if (layer.status === "ok_empty") {
      body = "No events in this window. Source healthy — an empty result is a valid state.";
    } else {
      body = "No data at the selected time.";
    }
    const note = document.createElement("div");
    note.className = `empty-note kind-${kind}`;
    note.innerHTML =
      `<span class="note-icon">${icon}</span>` +
      `<span><span class="note-title">${esc(title)}</span>${esc(body)}</span>`;
    host.appendChild(note);
  }
}

/* ================= inspector ================= */

function bindCanvas() {
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best = null;
    let bestDist = 16; // px tolerance
    for (const h2 of state.hitTargets) {
      const d = Math.hypot(h2.x - mx, h2.y - my) - h2.r;
      if (d < bestDist) { bestDist = d; best = h2; }
    }
    state.selected = best ? { layerId: best.layerId, featureId: best.feature.id } : null;
    refreshPanels();
  });
}

function findSelected() {
  if (!state.selected) return null;
  const layer = state.snapshot.layers[state.selected.layerId];
  const feature = layer?.features.find((f) => f.id === state.selected.featureId);
  return feature ? { layer, layerId: state.selected.layerId, feature } : null;
}

function renderInspector(t) {
  const host = $("inspector");
  const sel = findSelected();
  if (!sel) {
    host.innerHTML = regionalOverviewHtml(t);
    return;
  }
  const { layer, layerId, feature } = sel;
  const style = LAYER_STYLE[layerId] ?? { color: "#8c9cc0", glyph: "●" };
  const obs = observationAt(feature, layer.kind, t);
  const src = state.snapshot.source_status.find((s) => s.source_id === layer.source_id);

  let html =
    `<div class="ins-card highlight">` +
    `<div class="ins-kicker" style="color:${style.color}">${style.glyph} ${esc(layer.label)}</div>` +
    `<h3 class="ins-title">${esc(feature.name)}</h3>` +
    `<div class="ins-sub">${feature.lat.toFixed(4)}, ${feature.lon.toFixed(4)} · ` +
    `<span class="status-chip ${esc(layer.status)}">${esc(layer.status.replace("_", " "))}</span> ` +
    `<span class="badge ${esc(src?.mode ?? "fixture")}">${esc(src?.mode ?? "fixture")}</span></div>` +
    `</div>`;

  if (obs) {
    html += `<dl class="kv-list">`;
    for (const [k, v] of Object.entries(obs.values)) {
      html += `<div class="kv-row"><dt>${esc(prettifyKey(k))}</dt><dd>${esc(String(v))}</dd></div>`;
    }
    html += `</dl>`;
    html += `<div class="ins-footer">Observed ${fmtTime(Date.parse(obs.observed_at))}` +
      (src ? `<br>Source: ${esc(src.name)}${src.license ? ` · ${esc(src.license)}` : ""}` : "") +
      `</div>`;
  } else {
    html += `<div class="ins-card"><span class="muted">No observation at or before the selected time.</span></div>`;
  }
  html += `<button class="btn-ghost" id="ins-clear">← Back to overview</button>`;
  host.innerHTML = html;
  $("ins-clear").addEventListener("click", () => {
    state.selected = null;
    refreshPanels();
  });
}

// Default inspector content: a live regional summary for the selected time.
function regionalOverviewHtml(t) {
  const L = state.snapshot.layers;
  const obsOf = (layer) =>
    layer.features.map((f) => observationAt(f, layer.kind, t)).filter(Boolean);

  const wx = obsOf(L.weather);
  const avgTemp = wx.length
    ? (wx.reduce((a, o) => a + o.values.temperature_c, 0) / wx.length).toFixed(1)
    : null;
  const maxWind = wx.length ? Math.max(...wx.map((o) => o.values.wind_speed_kmh)) : null;

  const aq = obsOf(L.air_quality);
  let worstAq = null;
  for (const o of aq) {
    if (!worstAq || o.values.pm2_5_ugm3 > worstAq.pm2_5_ugm3) worstAq = o.values;
  }

  const fires = L.fires.features.filter((f) => observationAt(f, "events", t));
  const totalFrp = fires.reduce((a, f) => {
    const o = observationAt(f, "events", t);
    return a + (o?.values.frp_mw ?? 0);
  }, 0);

  const quakes = L.earthquakes.features.filter((f) => observationAt(f, "events", t)).length;
  const pois = L.pois.features.length;

  const stat = (layerId, label, value, sub) => {
    const s = LAYER_STYLE[layerId];
    return (
      `<div class="stat-row" style="--c:${s.color}">` +
      `<span class="stat-icon" style="--c:${s.color}">${s.glyph}</span>` +
      `<div class="stat-body"><div class="stat-label">${esc(label)}</div>` +
      `<div class="stat-value">${value}</div>` +
      (sub ? `<div class="stat-sub">${esc(sub)}</div>` : "") +
      `</div></div>`
    );
  };

  return (
    `<div class="ins-card">` +
    `<div class="ins-kicker">Regional overview</div>` +
    `<h3 class="ins-title">${esc(state.snapshot.region.name.split("/")[0].trim())} y región</h3>` +
    `<div class="ins-sub">Snapshot state at ${fmtTime(t)}</div>` +
    `</div>` +
    stat("weather", "Weather",
      avgTemp !== null ? `${avgTemp} °C <small>avg across ${wx.length} stations</small>` : "—",
      maxWind !== null ? `Max wind ${maxWind} km/h` : null) +
    stat("air_quality", "Air quality",
      worstAq ? `PM2.5 ${worstAq.pm2_5_ugm3} µg/m³ <small>worst station</small>` : "—",
      worstAq ? `Category: ${worstAq.category.replace(/_/g, " ")}` : null) +
    stat("fires", "Fires / thermal",
      `${fires.length} active <small>in window</small>`,
      fires.length ? `Total FRP ${totalFrp.toFixed(1)} MW` : "No hotspots at this time") +
    stat("earthquakes", "Earthquakes",
      quakes === 0 ? `0 events` : `${quakes} events`,
      quakes === 0 ? "Region quiet — source OK, empty is a valid state" : null) +
    stat("pois", "Points of interest", `${pois} mapped`, "OpenStreetMap extract") +
    `<div class="ins-footer">Click any marker on the map to inspect its readings, source and freshness.</div>`
  );
}

/* ================= helpers ================= */

function prettifyKey(k) {
  return k
    .replace(/_ugm3$/, " (µg/m³)")
    .replace(/_kmh$/, " (km/h)")
    .replace(/_deg$/, " (°)")
    .replace(/_pct$/, " (%)")
    .replace(/_mm$/, " (mm)")
    .replace(/_mw$/, " (MW)")
    .replace(/_km$/, " (km)")
    .replace(/_c$/, " (°C)")
    .replace(/_/g, " ");
}

function fmtTime(ms) {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function fmtAgo(ms) {
  // Relative to the snapshot's generated_at, not the wall clock: fixture data
  // must read the same on any day it is opened.
  const ref = Date.parse(state.snapshot.generated_at);
  const min = Math.round((ref - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min before snapshot`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h before snapshot`;
  return `${Math.round(h / 24)} d before snapshot`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

init();
