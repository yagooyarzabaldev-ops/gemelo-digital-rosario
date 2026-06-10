# Build Rosario 4D Visual Digital Twin MVP

## Goal

Build a governed 3D/4D visual digital twin MVP for Rosario, Gran Rosario, Paraná corridor and Villa Constitución using public live data, Postgres, n8n, web visualization and SpecBridge governance.

## Initial scope

- Rosario as primary pilot city.
- Gran Rosario as regional expansion.
- Paraná corridor as spatial axis.
- Villa Constitución as secondary/local operational node.

## MVP capabilities

- Browser-based 3D/2.5D map.
- Layer toggles.
- Time slider.
- Inspector panel.
- Source freshness badges.
- Explicit no-data/error states.
- Fixture data mode.
- Postgres schema contract.
- n8n workflow templates.
- Snapshot JSON contract for frontend consumption.

## Public data sources

- OpenStreetMap / Overpass.
- Open-Meteo.
- USGS GeoJSON feeds.
- NASA FIRMS where access policy allows.

## Non-negotiable rules

- Do not fake live data.
- Do not commit secrets.
- Do not poll uncontrolled public APIs directly from the browser.
- Use n8n or backend/server-side ingestion for live sources.
- Every visible layer must expose source, status and freshness.

## Acceptance criteria

- Local fixture mode works without secrets.
- Frontend renders initial visual map shell.
- DB migration folder contains initial schema proposal.
- n8n workflow folder contains ingestion template specs.
- JSON snapshot contract is documented.
- Source failure and empty states are represented.
