// Validates data/fixtures/layer-snapshot.sample.json against the
// layer-snapshot contract (contracts/layer-snapshot.schema.json).
//
// Zero dependencies: the structural rules of the contract are asserted
// directly here so the check runs with nothing but Node.
//
//   node tests/validate-fixture.mjs            (validates the sample fixture)
//   node tests/validate-fixture.mjs <file>     (validates any snapshot file)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const target =
  process.argv[2] ?? resolve(REPO_ROOT, "data", "fixtures", "layer-snapshot.sample.json");

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const isIso = (s) => typeof s === "string" && ISO_RE.test(s) && !Number.isNaN(Date.parse(s));

const LAYER_STATUSES = ["ok", "ok_empty", "stale", "error"];
const SOURCE_STATUSES = ["ok", "stale", "error", "disabled"];
const LAYER_KINDS = ["timeseries", "events", "static"];
const REQUIRED_LAYERS = ["weather", "air_quality", "fires", "earthquakes", "pois"];

let doc;
try {
  doc = JSON.parse(readFileSync(target, "utf8"));
} catch (err) {
  console.error(`FAIL: cannot read/parse ${target}: ${err.message}`);
  process.exit(1);
}

/* ---- top level ---- */
check(doc.contract === "layer-snapshot", `contract must be "layer-snapshot", got ${JSON.stringify(doc.contract)}`);
check(/^\d+\.\d+\.\d+$/.test(doc.contract_version ?? ""), "contract_version must be semver");
check(typeof doc.snapshot_id === "string" && doc.snapshot_id.length > 0, "snapshot_id required");
check(isIso(doc.generated_at), "generated_at must be UTC ISO 8601 with Z");
check(["fixture", "live"].includes(doc.mode), "mode must be fixture|live");
if (doc.mode === "fixture") {
  check(typeof doc.disclaimer === "string" && doc.disclaimer.length > 0,
    "fixture snapshots must carry a disclaimer (no fake live data)");
}

/* ---- region ---- */
const bbox = doc.region?.bbox;
check(typeof doc.region?.name === "string", "region.name required");
check(Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => typeof n === "number"),
  "region.bbox must be [west, south, east, north] numbers");
if (Array.isArray(bbox) && bbox.length === 4) {
  check(bbox[0] < bbox[2], "bbox west must be < east");
  check(bbox[1] < bbox[3], "bbox south must be < north");
}

/* ---- time range ---- */
const tr = doc.time_range ?? {};
check(isIso(tr.start) && isIso(tr.end), "time_range.start/end must be ISO timestamps");
check(Number.isInteger(tr.step_minutes) && tr.step_minutes > 0, "time_range.step_minutes must be a positive integer");
if (isIso(tr.start) && isIso(tr.end)) {
  check(Date.parse(tr.start) <= Date.parse(tr.end), "time_range.start must be <= end");
}

/* ---- source status ---- */
const sources = doc.source_status ?? [];
check(Array.isArray(sources) && sources.length > 0, "source_status must be a non-empty array");
const sourceIds = new Set();
for (const [i, s] of sources.entries()) {
  const at = `source_status[${i}] (${s?.source_id ?? "?"})`;
  check(typeof s.source_id === "string" && s.source_id.length > 0, `${at}: source_id required`);
  check(!sourceIds.has(s.source_id), `${at}: duplicate source_id`);
  sourceIds.add(s.source_id);
  check(typeof s.name === "string" && s.name.length > 0, `${at}: name required`);
  check(SOURCE_STATUSES.includes(s.status), `${at}: status must be one of ${SOURCE_STATUSES.join("|")}`);
  check(["fixture", "live"].includes(s.mode), `${at}: mode must be fixture|live`);
  check(s.last_success_at === null || isIso(s.last_success_at), `${at}: last_success_at must be ISO or null`);
  check(s.last_error === null || typeof s.last_error === "string", `${at}: last_error must be string or null`);
  if (s.status === "error") {
    check(typeof s.last_error === "string" && s.last_error.length > 0,
      `${at}: an error source must explain itself via last_error`);
  }
}

/* ---- layers ---- */
const layers = doc.layers ?? {};
for (const id of REQUIRED_LAYERS) {
  check(id in layers, `missing required layer "${id}"`);
}
for (const [layerId, layer] of Object.entries(layers)) {
  const at = `layers.${layerId}`;
  check(layer.id === layerId, `${at}: id must equal its key`);
  check(typeof layer.label === "string" && layer.label.length > 0, `${at}: label required`);
  check(LAYER_KINDS.includes(layer.kind), `${at}: kind must be one of ${LAYER_KINDS.join("|")}`);
  check(LAYER_STATUSES.includes(layer.status), `${at}: status must be one of ${LAYER_STATUSES.join("|")}`);
  check(isIso(layer.last_updated), `${at}: last_updated must be ISO timestamp`);
  check(sourceIds.has(layer.source_id), `${at}: source_id "${layer.source_id}" has no source_status entry`);
  check(Array.isArray(layer.features), `${at}: features must be an array`);
  if (layer.status === "ok_empty") {
    check(layer.features.length === 0, `${at}: ok_empty layers must have zero features`);
  }
  if (layer.status === "ok" && layer.kind !== "static") {
    check(layer.features.length > 0, `${at}: ok non-static layers should have features (use ok_empty when empty)`);
  }

  const featureIds = new Set();
  for (const f of layer.features ?? []) {
    const fat = `${at}.features[${f?.id ?? "?"}]`;
    check(typeof f.id === "string" && f.id.length > 0, `${fat}: id required`);
    check(!featureIds.has(f.id), `${fat}: duplicate feature id`);
    featureIds.add(f.id);
    check(typeof f.name === "string" && f.name.length > 0, `${fat}: name required`);
    check(typeof f.lon === "number" && f.lon >= -180 && f.lon <= 180, `${fat}: lon out of range`);
    check(typeof f.lat === "number" && f.lat >= -90 && f.lat <= 90, `${fat}: lat out of range`);
    if (Array.isArray(bbox) && bbox.length === 4) {
      // Allow a small margin: river/delta features can sit at the bbox edge.
      const m = 0.5;
      check(f.lon >= bbox[0] - m && f.lon <= bbox[2] + m && f.lat >= bbox[1] - m && f.lat <= bbox[3] + m,
        `${fat}: coordinates fall far outside region.bbox`);
    }
    check(Array.isArray(f.observations), `${fat}: observations must be an array`);
    for (const [oi, obs] of (f.observations ?? []).entries()) {
      check(isIso(obs.observed_at), `${fat}.observations[${oi}]: observed_at must be ISO timestamp`);
      check(obs.values && typeof obs.values === "object" && !Array.isArray(obs.values),
        `${fat}.observations[${oi}]: values must be an object`);
    }
    // timeseries features must cover every step of the time range
    if (layer.kind === "timeseries" && isIso(tr.start) && isIso(tr.end) && tr.step_minutes > 0) {
      const expected = [];
      for (let t = Date.parse(tr.start); t <= Date.parse(tr.end); t += tr.step_minutes * 60000) expected.push(t);
      const got = new Set((f.observations ?? []).map((o) => Date.parse(o.observed_at)));
      check(expected.every((t) => got.has(t)),
        `${fat}: timeseries feature must have one observation per time_range step`);
    }
  }
}

/* ---- result ---- */
if (errors.length) {
  console.error(`FAIL: ${target}`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

const layerSummary = Object.values(layers)
  .map((l) => `${l.id}=${l.features.length}`)
  .join(", ");
console.log(`OK: ${target}`);
console.log(`  contract v${doc.contract_version}, mode=${doc.mode}`);
console.log(`  layers: ${layerSummary}`);
console.log(`  sources: ${sources.length} (${sources.map((s) => `${s.source_id}:${s.status}`).join(", ")})`);
