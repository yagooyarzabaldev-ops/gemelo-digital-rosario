-- 001_digital_twin_schema.sql
-- Initial schema proposal for the Rosario 4D digital twin.
--
-- Design notes:
--   * Everything lives in the digital_twin schema.
--   * The migration is idempotent (IF NOT EXISTS everywhere, seed inserts use
--     ON CONFLICT DO NOTHING) so re-running it is safe.
--   * Ingestion workflows upsert through the natural-key UNIQUE constraints
--     below, so retrying a failed n8n run never duplicates rows.
--   * Coordinates are plain WGS84 lon/lat doubles. PostGIS is intentionally
--     not required for the MVP; a later migration can add geometry columns.
--   * No credentials, roles or grants here — connection security is handled
--     outside the repository.

BEGIN;

CREATE SCHEMA IF NOT EXISTS digital_twin;

-- ---------------------------------------------------------------------------
-- sources: registry of upstream public data sources.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS digital_twin.sources (
    id                 text        PRIMARY KEY,          -- e.g. 'open-meteo'
    name               text        NOT NULL,
    url                text,
    license            text,
    cadence_minutes    integer     CHECK (cadence_minutes IS NULL OR cadence_minutes > 0),
    freshness_window_minutes integer NOT NULL DEFAULT 180
        CHECK (freshness_window_minutes > 0),             -- older than this => 'stale'
    enabled            boolean     NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- ingestion_runs: one row per n8n workflow execution against a source.
-- The freshness panel is derived from the latest run per source.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS digital_twin.ingestion_runs (
    id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id          text        NOT NULL REFERENCES digital_twin.sources (id),
    -- Idempotency key supplied by the workflow (e.g. n8n execution id).
    -- Retries of the same execution reuse the key instead of inserting twice.
    run_key            text        NOT NULL,
    started_at         timestamptz NOT NULL DEFAULT now(),
    finished_at        timestamptz,
    status             text        NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'success', 'partial', 'error')),
    records_ingested   integer     NOT NULL DEFAULT 0 CHECK (records_ingested >= 0),
    error_message      text,
    CONSTRAINT ingestion_runs_source_run_key UNIQUE (source_id, run_key)
);

CREATE INDEX IF NOT EXISTS ingestion_runs_source_started_idx
    ON digital_twin.ingestion_runs (source_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- geo_entities: stable spatial things observations attach to
-- (stations, POIs, grid cells, river segments...).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS digital_twin.geo_entities (
    id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id          text        NOT NULL REFERENCES digital_twin.sources (id),
    -- Upstream identifier (OSM id, station id, fixture feature id...).
    external_id        text        NOT NULL,
    kind               text        NOT NULL,              -- 'station' | 'poi' | 'grid_cell' | ...
    name               text        NOT NULL,
    lon                double precision NOT NULL CHECK (lon BETWEEN -180 AND 180),
    lat                double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
    properties         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT geo_entities_source_external UNIQUE (source_id, external_id)
);

CREATE INDEX IF NOT EXISTS geo_entities_kind_idx ON digital_twin.geo_entities (kind);

-- ---------------------------------------------------------------------------
-- observations: time-stamped measurements and events, one row per
-- (entity, layer, instant). The values payload is layer-specific JSON
-- matching docs/layer-snapshot-contract.md.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS digital_twin.observations (
    id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id          text        NOT NULL REFERENCES digital_twin.sources (id),
    entity_id          bigint      REFERENCES digital_twin.geo_entities (id),
    ingestion_run_id   bigint      REFERENCES digital_twin.ingestion_runs (id),
    layer              text        NOT NULL
        CHECK (layer IN ('weather', 'air_quality', 'fires', 'earthquakes', 'pois')),
    -- Upstream record id when the source provides one (USGS event id,
    -- FIRMS hotspot id...); falls back to the entity external_id.
    external_ref       text        NOT NULL,
    observed_at        timestamptz NOT NULL,
    lon                double precision NOT NULL CHECK (lon BETWEEN -180 AND 180),
    lat                double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
    values             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at         timestamptz NOT NULL DEFAULT now(),
    -- Natural key: re-ingesting the same upstream record is a no-op upsert.
    CONSTRAINT observations_natural_key UNIQUE (source_id, layer, external_ref, observed_at)
);

CREATE INDEX IF NOT EXISTS observations_layer_time_idx
    ON digital_twin.observations (layer, observed_at DESC);
CREATE INDEX IF NOT EXISTS observations_entity_idx
    ON digital_twin.observations (entity_id);

-- ---------------------------------------------------------------------------
-- layer_snapshots: published frontend-facing documents
-- (contracts/layer-snapshot.schema.json). The frontend reads these; it never
-- queries observations directly.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS digital_twin.layer_snapshots (
    id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    snapshot_id        text        NOT NULL,
    contract_version   text        NOT NULL,
    mode               text        NOT NULL CHECK (mode IN ('fixture', 'live')),
    generated_at       timestamptz NOT NULL,
    time_start         timestamptz NOT NULL,
    time_end           timestamptz NOT NULL,
    payload            jsonb       NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT layer_snapshots_snapshot_id UNIQUE (snapshot_id),
    CONSTRAINT layer_snapshots_time_order CHECK (time_start <= time_end)
);

CREATE INDEX IF NOT EXISTS layer_snapshots_generated_idx
    ON digital_twin.layer_snapshots (generated_at DESC);

-- ---------------------------------------------------------------------------
-- Seed the source registry (idempotent). No credentials involved: these are
-- public endpoints; API keys (e.g. FIRMS MAP_KEY) live only in n8n credentials.
-- ---------------------------------------------------------------------------
INSERT INTO digital_twin.sources (id, name, url, license, cadence_minutes, freshness_window_minutes)
VALUES
    ('open-meteo',             'Open-Meteo (weather)',          'https://open-meteo.com/',                              'CC BY 4.0',                60,   180),
    ('open-meteo-air-quality', 'Open-Meteo Air Quality',        'https://open-meteo.com/en/docs/air-quality-api',       'CC BY 4.0',                60,   180),
    ('nasa-firms',             'NASA FIRMS (fires)',            'https://firms.modaps.eosdis.nasa.gov/',                'NASA open data policy',    180,  720),
    ('usgs-earthquakes',       'USGS Earthquakes GeoJSON',      'https://earthquake.usgs.gov/earthquakes/feed/',        'Public domain (USGS)',     60,   180),
    ('osm-overpass',           'OpenStreetMap / Overpass (POIs)','https://www.openstreetmap.org/',                      'ODbL 1.0',                 NULL, 43200)
ON CONFLICT (id) DO NOTHING;

COMMIT;
