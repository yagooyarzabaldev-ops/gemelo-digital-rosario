/* Gemelo Digital Rosario — 4D visual shell.
 *
 * Fixture-driven frontend: everything rendered here comes from one prepared
 * layer-snapshot document (contracts/layer-snapshot.schema.json). The browser
 * never calls public APIs directly.
 *
 * The map is a deliberate placeholder scene: a canvas projection of the region
 * bbox with a schematic Paraná river and city anchors. It will be replaced by
 * MapLibre GL + deck.gl in a later iteration without changing the snapshot
 * contract.
 */
"use strict";

const SNAPSHOT_URL = "../../data/fixtures/layer-snapshot.sample.json";

const LAYER_STYLE = {
  weather: { color: "#5cc8ff", shape: "circle" },
  air_quality: { color: "#3ecf8e", shape: "square" },
  fires: { color: "#ff7a45", shape: "triangle" },
  earthquakes: { color: "#f25f5c", shape: "ring" },
  pois: { color: "#b58cff", shape: "diamond" },
};

// Schematic basemap geometry (WGS84). Placeholder until a real basemap lands.
const RIVER_PARANA = [
  [-60.755, -32.580], [-60.745, -32.650], [-60.730, -32.720], [-60.705, -32.780],
  [-60.675, -32.840], [-60.650, -32.890], [-60.625, -32.940], [-60.605, -32.990],
  [-60.585, -33.040], [-60.520, -33.100], [-60.440, -33.160], [-60.360, -33.215],
  [-60.300, -33.260],
];

const CITIES = [
  { name: "Rosario", lon: -60.6505, lat: -32.9468, major: true },
  { name: "San Lorenzo", lon: -60.7333, lat: -32.7459 },
  { name: "Capitán Bermúdez", lon: -60.7150, lat: -32.8210 },
  { name: "Granadero Baigorria", lon: -60.6794, lat: -32.8569 },
  { name: "Funes", lon: -60.8103, lat: -32.9211 },
  { name: "Roldán", lon: -60.9100, lat: -32.8990 },
  { name: "V. Gdor. Gálvez", lon: -60.6044, lat: -33.0256 },
  { name: "Arroyo Seco", lon: -60.5100, lat: -33.1550 },
  { name: "Villa Constitución", lon: -60.3297, lat: -33.2329, major: true },
];

const state = {
  snapshot: null,
  enabled: new Set(Object.keys(LAYER_STYLE)),
  timeSteps: [],
  timeIndex: 0,
  selected: null, // { layerId, featureId }
  hitTargets: [], // recomputed on every draw
  playTimer: null,
};

const $ = (id) => document.getElementById(id);
const canvas = $("map");
const ctx = canvas.getContext("2d");

/* ---------------- data loading ---------------- */

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
  bindTimebar();
  bindCanvas();
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
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

/* ---------------- header / panels ---------------- */

function renderModeBanner() {
  const { mode, disclaimer } = state.snapshot;
  const el = $("mode-banner");
  el.hidden = false;
  el.classList.add(mode);
  el.textContent =
    mode === "fixture"
      ? `FIXTURE MODE — ${disclaimer ?? "sample data, not live"}`
      : "LIVE MODE";
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
    const style = LAYER_STYLE[layerId] ?? { color: "#999" };
    const li = document.createElement("li");
    li.className = "layer-item";
    li.innerHTML =
      `<label><input type="checkbox" checked data-layer="${esc(layerId)}">` +
      `<span class="layer-swatch" style="background:${style.color}"></span>` +
      `<span class="layer-name">${esc(layer.label)}</span>` +
      `<span class="layer-count">${layer.features.length}</span></label>` +
      `<span class="badge ${esc(layer.status)}">${esc(layer.status.replace("_", " "))}</span>`;
    li.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) state.enabled.add(layerId);
      else state.enabled.delete(layerId);
      draw();
    });
    ul.appendChild(li);
  }
}

function renderSourceStatus() {
  const ul = $("source-status");
  ul.innerHTML = "";
  for (const src of state.snapshot.source_status) {
    const li = document.createElement("li");
    li.className = "source-item";
    const freshness = src.last_success_at
      ? `last success ${fmtAgo(Date.parse(src.last_success_at))}`
      : "never succeeded";
    li.innerHTML =
      `<div class="source-head"><span class="source-name">${esc(src.name)}</span>` +
      `<span class="badge ${esc(src.status)}">${esc(src.status)}</span></div>` +
      `<div class="source-meta">${esc(freshness)} · <span class="badge ${esc(src.mode)}">${esc(src.mode)}</span>` +
      (src.license ? ` · ${esc(src.license)}` : "") + `</div>` +
      (src.last_error ? `<div class="source-error">⚠ ${esc(src.last_error)}</div>` : "");
    ul.appendChild(li);
  }
  const names = state.snapshot.source_status
    .filter((s) => s.url)
    .map((s) => s.name)
    .join(" · ");
  $("map-attribution").textContent =
    `${state.snapshot.mode === "fixture" ? "fixture data · " : ""}sources: ${names}`;
}

/* ---------------- time bar ---------------- */

function bindTimebar() {
  const slider = $("time-slider");
  slider.addEventListener("input", () => {
    state.timeIndex = Number(slider.value);
    stopPlayback();
    draw();
  });
  $("play-btn").addEventListener("click", () => {
    if (state.playTimer) stopPlayback();
    else startPlayback();
  });
  $("time-range-label").textContent =
    `window ${fmtTime(state.timeSteps[0])} → ${fmtTime(state.timeSteps.at(-1))}`;
}

function startPlayback() {
  $("play-btn").textContent = "⏸";
  state.playTimer = setInterval(() => {
    state.timeIndex = (state.timeIndex + 1) % state.timeSteps.length;
    $("time-slider").value = String(state.timeIndex);
    draw();
  }, 900);
}

function stopPlayback() {
  if (state.playTimer) clearInterval(state.playTimer);
  state.playTimer = null;
  $("play-btn").textContent = "▶";
}

/* ---------------- projection ---------------- */

function makeProjector() {
  const [west, south, east, north] = state.snapshot.region.bbox;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const pad = 36;
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

/* ---------------- time selection ---------------- */

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

/* ---------------- drawing ---------------- */

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw() {
  if (!state.snapshot) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const project = makeProjector();
  const t = currentTime();
  state.hitTargets = [];

  // background
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0b1322");
  grad.addColorStop(1, "#0a1018");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  drawGrid(project);
  drawRiver(project);
  drawCities(project);
  drawLayers(project, t);
  drawSelectionRing(project);

  $("time-label").textContent = fmtTime(t);
  renderEmptyNotes(t);
  renderInspector(t);
}

function drawGrid(project) {
  const [west, south, east, north] = state.snapshot.region.bbox;
  ctx.strokeStyle = "rgba(120, 150, 200, 0.07)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(120, 150, 200, 0.25)";
  ctx.font = "10px system-ui";
  for (let lon = Math.ceil(west * 10) / 10; lon <= east; lon += 0.1) {
    const [x1, y1] = project(lon, south);
    const [x2, y2] = project(lon, north);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.fillText(lon.toFixed(1) + "°", x2 + 2, y2 + 10);
  }
  for (let lat = Math.ceil(south * 10) / 10; lat <= north; lat += 0.1) {
    const [x1, y1] = project(west, lat);
    const [x2, y2] = project(east, lat);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.fillText(lat.toFixed(1) + "°", x1 + 2, y1 - 3);
  }
}

function drawRiver(project) {
  const pts = RIVER_PARANA.map(([lon, lat]) => project(lon, lat));
  // wide water band
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(36, 78, 130, 0.55)";
  ctx.lineWidth = 26;
  pathThrough(pts);
  ctx.stroke();
  // channel core
  ctx.strokeStyle = "rgba(80, 150, 220, 0.45)";
  ctx.lineWidth = 7;
  pathThrough(pts);
  ctx.stroke();
  // label along the river
  const [lx, ly] = project(-60.52, -33.06);
  ctx.fillStyle = "rgba(120, 175, 230, 0.6)";
  ctx.font = "italic 12px system-ui";
  ctx.fillText("Río Paraná", lx + 14, ly - 8);
}

function pathThrough(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
}

function drawCities(project) {
  for (const c of CITIES) {
    const [x, y] = project(c.lon, c.lat);
    ctx.fillStyle = c.major ? "rgba(230, 236, 247, 0.85)" : "rgba(230, 236, 247, 0.45)";
    ctx.beginPath();
    ctx.arc(x, y, c.major ? 3.2 : 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = c.major ? "600 12px system-ui" : "11px system-ui";
    ctx.fillText(c.name, x + 7, y + 4);
  }
}

function drawLayers(project, t) {
  for (const [layerId, layer] of Object.entries(state.snapshot.layers)) {
    if (!state.enabled.has(layerId)) continue;
    const style = LAYER_STYLE[layerId] ?? { color: "#999", shape: "circle" };
    for (const feature of layer.features) {
      const obs = observationAt(feature, layer.kind, t);
      if (!obs) continue; // nothing to show at/before this time
      const [x, y] = project(feature.lon, feature.lat);
      const age = t - Date.parse(obs.observed_at);
      // events older than two slider steps fade out but stay inspectable
      const stale =
        layer.kind === "events" &&
        age > 2 * state.snapshot.time_range.step_minutes * 60000;
      ctx.globalAlpha = stale ? 0.4 : 1;
      const r = markerRadius(layerId, obs);
      drawMarker(style, x, y, r);
      drawMarkerLabel(layerId, obs, x, y, r);
      ctx.globalAlpha = 1;
      state.hitTargets.push({ x, y, r: Math.max(r, 9), layerId, feature, obs });
    }
  }
}

function markerRadius(layerId, obs) {
  const v = obs.values;
  switch (layerId) {
    case "fires": return 5 + Math.min(10, (v.frp_mw ?? 0) / 4);
    case "earthquakes": return 5 + Math.min(12, (v.magnitude ?? 0) * 2);
    case "air_quality": return 5 + Math.min(8, (v.pm2_5_ugm3 ?? 0) / 6);
    case "weather": return 6;
    default: return 5;
  }
}

function drawMarker(style, x, y, r) {
  ctx.fillStyle = style.color;
  ctx.strokeStyle = "rgba(10, 15, 26, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  switch (style.shape) {
    case "square":
      ctx.rect(x - r, y - r, r * 2, r * 2);
      break;
    case "triangle":
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.lineTo(x - r, y + r);
      ctx.closePath();
      break;
    case "diamond":
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case "ring":
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r / 2.5, 0, Math.PI * 2);
      break;
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
}

function drawMarkerLabel(layerId, obs, x, y, r) {
  let text = null;
  if (layerId === "weather") text = `${obs.values.temperature_c}°`;
  if (layerId === "air_quality") text = `${obs.values.pm2_5_ugm3}`;
  if (!text) return;
  ctx.font = "600 10px system-ui";
  ctx.fillStyle = "rgba(230, 236, 247, 0.9)";
  ctx.fillText(text, x + r + 3, y - r + 2);
}

function drawSelectionRing(project) {
  const sel = findSelected();
  if (!sel) return;
  const [x, y] = project(sel.feature.lon, sel.feature.lat);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

/* ---------------- empty / error states ---------------- */

function renderEmptyNotes(t) {
  const host = $("map-empty-notes");
  host.innerHTML = "";
  for (const [layerId, layer] of Object.entries(state.snapshot.layers)) {
    if (!state.enabled.has(layerId)) continue;
    const visible = layer.features.filter((f) => observationAt(f, layer.kind, t));
    if (visible.length > 0 && layer.status !== "stale" && layer.status !== "error") continue;
    const note = document.createElement("div");
    note.className = "empty-note";
    if (layer.status === "error") {
      note.classList.add("error");
      note.textContent = `${layer.label}: source error — no trusted data to display.`;
    } else if (layer.status === "stale") {
      note.classList.add("stale");
      note.textContent = `${layer.label}: showing last known data (source stale since ${fmtTime(Date.parse(layer.last_updated))}).`;
      if (visible.length === 0) note.textContent += " Nothing in the selected window.";
    } else if (layer.status === "ok_empty") {
      note.textContent = `${layer.label}: no events in this window (source OK — empty is a valid state).`;
    } else {
      note.textContent = `${layer.label}: no data at the selected time.`;
    }
    host.appendChild(note);
  }
}

/* ---------------- inspector ---------------- */

function bindCanvas() {
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best = null;
    let bestDist = 14; // px tolerance
    for (const h2 of state.hitTargets) {
      const d = Math.hypot(h2.x - mx, h2.y - my) - h2.r;
      if (d < bestDist) { bestDist = d; best = h2; }
    }
    state.selected = best ? { layerId: best.layerId, featureId: best.feature.id } : null;
    draw();
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
    host.innerHTML = `<p class="muted">Click a marker on the map to inspect it.</p>`;
    return;
  }
  const { layer, layerId, feature } = sel;
  const obs = observationAt(feature, layer.kind, t);
  const src = state.snapshot.source_status.find((s) => s.source_id === layer.source_id);
  let html =
    `<h3>${esc(feature.name)}</h3>` +
    `<p class="muted">${esc(layer.label)} · ${feature.lat.toFixed(4)}, ${feature.lon.toFixed(4)}</p>` +
    `<p><span class="badge ${esc(layer.status)}">${esc(layer.status.replace("_", " "))}</span> ` +
    `<span class="badge ${esc(src?.mode ?? "fixture")}">${esc(src?.mode ?? "fixture")}</span></p>`;
  if (obs) {
    html += `<dl>`;
    for (const [k, v] of Object.entries(obs.values)) {
      html += `<dt>${esc(prettifyKey(k))}</dt><dd>${esc(String(v))}</dd>`;
    }
    html += `</dl><p class="obs-time">observed ${fmtTime(Date.parse(obs.observed_at))}</p>`;
  } else {
    html += `<p class="muted">No observation at or before the selected time.</p>`;
  }
  if (src) {
    html += `<p class="obs-time">source: ${esc(src.name)}${src.license ? ` (${esc(src.license)})` : ""}</p>`;
  }
  host.innerHTML = html;
}

/* ---------------- helpers ---------------- */

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
