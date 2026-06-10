# Layer Snapshot Contract

Version: **1.0.0**
Schema: [`contracts/layer-snapshot.schema.json`](../contracts/layer-snapshot.schema.json)
Sample: [`data/fixtures/layer-snapshot.sample.json`](../data/fixtures/layer-snapshot.sample.json)

## Purpose

The layer snapshot is the **only** data interface between the ingestion side (n8n + Postgres)
and the frontend. The browser never calls public APIs directly; it loads one prepared snapshot
JSON document and renders everything from it. This keeps public API usage controlled, makes the
frontend fully testable offline, and makes "what the user saw at time T" reproducible.

```
public APIs ──(n8n ingestion)──▶ Postgres (digital_twin.*) ──(publish workflow)──▶ snapshot JSON ──▶ browser
```

## Top-level document

| Field | Type | Meaning |
|---|---|---|
| `contract` | const `"layer-snapshot"` | Document type discriminator. |
| `contract_version` | semver string | Version of this contract. Breaking changes bump the major version. |
| `snapshot_id` | string | Stable id; idempotency key for `digital_twin.layer_snapshots`. |
| `generated_at` | UTC ISO 8601 | When the snapshot was produced. |
| `mode` | `fixture` \| `live` | `fixture` is deterministic sample data. The frontend must display the mode prominently — **never present fixture data as live**. |
| `disclaimer` | string | Required when `mode = fixture`. |
| `region` | object | `name` plus `bbox` as `[west, south, east, north]` (WGS84). |
| `time_range` | object | `start`, `end`, `step_minutes` — the window the time slider covers. |
| `layers` | object | Keyed by layer id. `weather`, `air_quality`, `fires`, `earthquakes`, `pois` are required. |
| `source_status` | array | One entry per upstream source (see below). |

## Layers

Each layer has:

- `id`, `label` — identity and display name.
- `kind` — how the time slider treats the features:
  - `timeseries`: every feature has one observation per `time_range` step (weather, air quality).
    The slider selects the observation closest at-or-before the selected time.
  - `events`: sparse point-in-time events (fires, earthquakes). The slider shows events that
    occurred at or before the selected time within the window.
  - `static`: slowly changing reference data (POIs). Shown regardless of slider position.
- `source_id` — must match a `source_status[].source_id` entry in the same document.
- `status` — `ok`, `ok_empty`, `stale`, `error`.
- `last_updated` — when this layer's data was last refreshed.
- `features[]` — each with `id`, `name`, `lon`, `lat` and `observations[]`
  (`observed_at` + free-form `values` object).

### Empty is a valid state

`status: "ok_empty"` with `features: []` means the source worked and there is genuinely nothing
to show (e.g. no earthquakes in the region this window). The frontend must render this as an
explicit "no events" message — not as an error and not by hiding the layer silently.

### Layer-specific `values` keys (v1)

| Layer | Keys |
|---|---|
| `weather` | `temperature_c`, `relative_humidity_pct`, `wind_speed_kmh`, `wind_direction_deg`, `precipitation_mm` |
| `air_quality` | `pm2_5_ugm3`, `pm10_ugm3`, `category` (`good` / `moderate` / `unhealthy_sensitive`) |
| `fires` | `confidence`, `frp_mw` (fire radiative power), `satellite` |
| `earthquakes` | `magnitude`, `depth_km`, `place` |
| `pois` | `category`, `city` |

New keys may be added in minor versions; consumers must ignore unknown keys.

## Source status

Every upstream source gets an entry, even when it failed — *especially* when it failed:

| Field | Meaning |
|---|---|
| `source_id` | Stable id, matches `digital_twin.sources.id`. |
| `name`, `url`, `license` | Attribution shown in the UI. |
| `status` | `ok` (fresh), `stale` (last success older than the source's freshness window), `error` (last attempt failed), `disabled`. |
| `mode` | `fixture` or `live`, per source. |
| `last_success_at` | UTC timestamp or `null` if it never succeeded. |
| `last_error` | Message of the last failure, or `null`. |
| `note` | Free-text context for operators. |

The frontend renders these as the freshness panel. A failed source must remain visible with its
error — sources are never silently dropped from the panel.

## Validation

```
node tests/validate-fixture.mjs
```

validates the sample fixture against this contract (structure, enums, timestamps, bbox
containment, cross-references between layers and `source_status`).
