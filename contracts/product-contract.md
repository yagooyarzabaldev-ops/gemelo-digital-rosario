# Product Contract — Gemelo Digital Rosario

## Goal

Build a governed 3D/4D visual digital twin MVP for Rosario, Gran Rosario, Paraná corridor and Villa Constitución.

The system must show public-data spatial layers over time, with explicit freshness, source attribution and no fake real-time data.

## Core layers

1. OpenStreetMap base entities.
2. Weather observations.
3. Air-quality observations.
4. Fire / thermal anomaly observations.
5. Earthquake observations.
6. Internal local POIs / sponsors.

## MVP rules

- Do not fake live data.
- Do not commit secrets.
- Public API ingestion must be controlled through n8n or backend snapshots.
- Browser must consume prepared JSON snapshots, not uncontrolled public API polling.
- Every layer must show freshness and source status.
- Empty datasets are valid states and must be displayed clearly.

## MVP acceptance criteria

- App runs locally with fixture data.
- Frontend renders map, layer toggles, time slider and inspector panel.
- DB migration contract is present.
- n8n workflow templates are present.
- Source failures and no-data states are represented.
