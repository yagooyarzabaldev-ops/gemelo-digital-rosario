# Claude Implementation Task — Issue #2 MVP Foundation

Repository: yagooyarzabaldev-ops/gemelo-digital-rosario
Issue: https://github.com/yagooyarzabaldev-ops/gemelo-digital-rosario/issues/2

## Goal

Implement the first real MVP foundation for Rosario 4D Visual Digital Twin.

This is not a production deployment. This is a local, fixture-driven, browser-viewable foundation.

## Required implementation scope

You may modify and create files only under:

- README.md
- contracts/**
- docs/**
- apps/web/**
- db/migrations/**
- n8n/workflows/**
- data/fixtures/**
- public/**
- tests/**
- specbridge/**

Do not touch:

- .env
- secrets/**
- infra/prod/**
- real production credentials
- deployment automation
- billing/authentication systems

## MVP deliverables

1. Frontend shell in apps/web:
   - Static browser app.
   - Map-like visual panel or placeholder scene.
   - Layer toggles.
   - Time slider.
   - Inspector panel.
   - Source status / freshness panel.
   - Fixture mode only.

2. Fixture data:
   - data/fixtures/layer-snapshot.sample.json
   - Include Rosario, Gran Rosario, Paraná corridor and Villa Constitución.
   - Include layers: weather, air_quality, fires, earthquakes, pois, source_status.
   - No fake "live" claim. Mark all as fixture/sample.

3. JSON snapshot contract:
   - contracts/layer-snapshot.schema.json
   - docs/layer-snapshot-contract.md

4. Database migration proposal:
   - db/migrations/001_digital_twin_schema.sql
   - Include schemas/tables:
     - digital_twin.sources
     - digital_twin.ingestion_runs
     - digital_twin.geo_entities
     - digital_twin.observations
     - digital_twin.layer_snapshots
   - Include idempotent-friendly constraints.
   - No secrets.

5. n8n workflow templates:
   - n8n/workflows/dt-ingest-openmeteo.template.json
   - n8n/workflows/dt-ingest-usgs-earthquakes.template.json
   - n8n/workflows/dt-ingest-firms-fires.template.json
   - n8n/workflows/dt-publish-layer-snapshot.template.json
   - These can be template/spec JSON files, not production credentials.

6. Tests / validation:
   - Add a lightweight validation script if reasonable.
   - Validate fixture JSON shape.
   - Document how to run locally.

7. README:
   - Update with run instructions.
   - Explain architecture.
   - Explain fixture mode vs live ingestion.

## Quality bar

- Keep it simple but real.
- No hallucinated live data.
- No secrets.
- No external production calls required to run locally.
- Prefer deterministic fixture data.
- Make the first frontend visually useful, not just blank HTML.
- Commit changes with a clear message.

## Expected final state

A user can open the local frontend and see the first visual shell of the Rosario 4D digital twin using fixture data.
