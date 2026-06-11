# Gemelo Digital Rosario

Visual 3D/4D digital twin for **Rosario, Gran Rosario, the Paraná corridor and Villa Constitución**.

Product name: **CityPulse 4D / Gemelo Vivo**

This repository contains the MVP foundation: a fixture-driven, browser-viewable visual shell
plus the contracts that the live ingestion pipeline will fulfil. Nothing here requires
secrets, external API calls or a deployment to run.

## Live demo

Public, static, fixture-only demo (no backend, no secrets, no real data, no live claim):

- **Landing:** https://yagooyarzabaldev-ops.github.io/gemelo-digital-rosario/
- **CityPulse 4D (territorial):** https://yagooyarzabaldev-ops.github.io/gemelo-digital-rosario/apps/web/
- **PersonaTwin (self-verification, mock):** https://yagooyarzabaldev-ops.github.io/gemelo-digital-rosario/apps/web/verify/

Served via GitHub Pages from the repository root. The fixture-mode / demo banners stay visible
throughout — everything you see is deterministic sample data.

**Commercial pitch package** (for municipalities, ports, industry, sponsors and institutional
partners): see [docs/pitch/](docs/pitch/) — one-pager, demo script, positioning by segment,
roadmap and risk/privacy notes.

## Quick start (fixture mode)

Requires Node.js (any recent version; no npm packages needed).

```
node apps/web/serve.mjs
```

Then open **http://localhost:8080/apps/web/** in a browser.

You will see the first visual shell of the digital twin running on deterministic sample data:

- a map-like canvas scene of the region (schematic Paraná river, city anchors, lon/lat grid);
- **layer toggles** for weather, air quality, fires, earthquakes and POIs;
- a **time slider** (with playback) over the fixture's 24-hour window;
- an **inspector panel** — click any marker to see its values, source and freshness;
- a **sources & freshness panel** with honest per-source badges, including a deliberately
  stale source (NASA FIRMS) and a deliberately failing demo source;
- explicit **empty / error states** — the earthquakes layer is intentionally empty
  (`ok_empty`) because zero events is a valid, expected result for this region.

A purple **FIXTURE MODE** banner is always visible: this data is sample data, never
presented as live.

### Validate the fixtures

```
node tests/validate-fixture.mjs           # city layer snapshot
node tests/validate-identity-fixture.mjs  # identity verification result
```

The first checks the sample snapshot against the layer-snapshot contract: required layers,
status enums, ISO timestamps, bbox containment, layer↔source cross-references, and
one-observation-per-step coverage for timeseries layers. The second checks the identity
verification fixture (see below). Both exit non-zero on any violation; run them after any
change to a fixture or its contract.

## PersonaTwin — Gemelo Personal Verificado (self-verification demo)

Open **http://localhost:8080/apps/web/verify/** (linked from the dashboard top bar).

PersonaTwin is a **synthetic demo with privacy safeguards** — not a public-data DNI lookup. A
person verifies **their own** identity with explicit consent and sees it as a personal digital
twin (identity card, domicilio mini-map, governance panel, session audit trail).

> Este demo no consulta RENAPER ni bases reales. Sólo usa datos sintéticos.

- Self-verification only — the subject is always the requester, behind a required consent gate.
- In demo (`mock`) mode only one **synthetic** test identity resolves; any other document
  returns a clean "sin coincidencia" state, so it cannot profile real people.
- With the subject's consent, the verified profile is enriched with **public data associated
  with their OWN DNI/CUIL** (AFIP, padrón electoral, Boletín Oficial, registries) — synthetic and
  mock in the demo, each source showing its own status/freshness, including a "sin registros"
  empty state. Still self-only; never a third-party lookup.
- A real deployment verifies server-side via n8n against an authorized provider (RENAPER under
  convenio); credentials never reach the browser and are never committed.
- Data is minimized, retained for a bounded period, audited, and the titular can exercise ARCO
  rights as distinct flows: **Descargar mis datos** (acceso, JSON export), **Solicitar
  rectificación** (request + audit, mutates nothing), **Revocar consentimiento** (blocks further
  use; not the same as deletion), and **Eliminar mis datos** (supresión).

Why it is shaped this way: aggregating records about an arbitrary person by DNI would be
privacy-invasive profiling and conflicts with **Ley 25.326 (Protección de Datos Personales)**.
The contract, schema and workflow encode the consented, self-only version. Going to a real
(live) deployment would require an authorized provider/convenio, credentials by environment, a
privacy contact, a DPIA/legal review, registration and obligations where applicable, and a
deployed Postgres + n8n backend — none of which ship here. See
[docs/identity-verification-contract.md](docs/identity-verification-contract.md) and
[specbridge/identity-verification-spec.md](specbridge/identity-verification-spec.md).

## Architecture

```
                 public data sources (Open-Meteo, USGS, NASA FIRMS, OSM/Overpass)
                                        │
                              n8n ingestion workflows          ← n8n/workflows/dt-ingest-*.template.json
                                        │  (controlled, scheduled, idempotent upserts)
                                        ▼
                              Postgres  digital_twin.*         ← db/migrations/001_digital_twin_schema.sql
                       sources · ingestion_runs · geo_entities · observations
                                        │
                              snapshot publish workflow        ← n8n/workflows/dt-publish-layer-snapshot.template.json
                                        ▼
                              layer snapshot JSON document     ← contracts/layer-snapshot.schema.json
                                        │                         docs/layer-snapshot-contract.md
                                        ▼
                              browser frontend (apps/web)      ← reads snapshots only
```

Key decisions:

- **The browser never polls public APIs.** All ingestion happens through n8n (or a backend)
  on a controlled schedule; the frontend consumes prepared snapshot documents. This is what
  makes fixture mode and live mode interchangeable.
- **One contract in the middle.** The layer snapshot
  ([docs/layer-snapshot-contract.md](docs/layer-snapshot-contract.md)) is the single
  interface between ingestion and visualization. The fixture file is simply a hand-authored
  instance of it; the publish workflow produces live instances of the same shape.
- **Freshness is data, not decoration.** Every source carries `status`, `last_success_at`
  and `last_error` through the whole pipeline (ingestion_runs → snapshot → UI badges).
  Broken sources stay visible with their error; stale data is labeled stale; empty datasets
  render as explicit "no events" states.
- **Idempotent ingestion.** All tables expose natural-key UNIQUE constraints so workflow
  retries upsert instead of duplicating (see the migration's comments).
- The current map is a **placeholder canvas scene**; the planned MapLibre GL + deck.gl
  (and later Three.js/WebXR) upgrade replaces the renderer without touching the contract.

## Fixture mode vs live ingestion

| | Fixture mode (this MVP) | Live ingestion (next) |
|---|---|---|
| Data origin | `data/fixtures/layer-snapshot.sample.json`, deterministic and hand-authored | n8n workflows pulling Open-Meteo, USGS, FIRMS, OSM into Postgres |
| Snapshot `mode` | `"fixture"` + mandatory disclaimer, purple banner in UI | `"live"` |
| Requirements | Node.js only — no network, no DB, no secrets | Postgres + n8n instance + your own credentials (configured inside n8n, never committed) |
| Freshness badges | Simulated states (one stale source, one failing source, one empty layer) so every UI state is exercised | Computed from `digital_twin.ingestion_runs` against each source's freshness window |

The non-negotiable rule in both modes: **no fake live data**. Fixture data is always labeled
as fixture; live data that stops flowing is labeled stale or error, never silently reused.

## Repository layout

| Path | Contents |
|---|---|
| [apps/web/](apps/web/) | Static frontend shell + zero-dependency dev server |
| [contracts/](contracts/) | Product contract and the layer-snapshot JSON Schema |
| [docs/](docs/) | Contract documentation |
| [data/fixtures/](data/fixtures/) | Deterministic sample snapshot |
| [db/migrations/](db/migrations/) | Postgres schema proposal (`digital_twin` schema, idempotent) |
| [n8n/workflows/](n8n/workflows/) | Ingestion + publish workflow templates (no credentials — placeholders only) |
| [tests/](tests/) | Fixture/contract validation script |
| [specbridge/](specbridge/) | Governance task specs |

## Applying the database migration (optional, for live mode work)

The migration is idempotent and safe to re-run:

```
psql -d <your_database> -f db/migrations/001_digital_twin_schema.sql
```

It creates the `digital_twin` schema, five tables and seeds the public source registry.
It contains no credentials, roles or grants.

## n8n workflow templates

Import the files under [n8n/workflows/](n8n/workflows/) into a local n8n instance. Each is a
template: attach **your own** Postgres credential (and a NASA FIRMS MAP_KEY for the fires
workflow) inside n8n before activating. Credentials are never committed to this repository.

## Public data sources

- [OpenStreetMap / Overpass](https://www.openstreetmap.org/) — ODbL 1.0
- [Open-Meteo](https://open-meteo.com/) (weather + air quality) — CC BY 4.0
- [USGS earthquake GeoJSON feeds](https://earthquake.usgs.gov/earthquakes/feed/) — public domain
- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) — where access policy allows

## Core principle

No fake real-time data. Every visible layer must expose source, freshness and status.
