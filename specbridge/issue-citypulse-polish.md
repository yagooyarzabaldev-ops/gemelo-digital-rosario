## Goal

Polish the CityPulse 4D territorial dashboard for Rosario, Gran Rosario, Paraná corridor and Villa Constitución so it becomes demo-worthy.

## Context

The current territorial dashboard is functionally useful but visually weak. It was accepted as an MVP foundation only. This issue must improve the visual and UX layer without changing the core data contract.

## Scope

Allowed:

- `apps/web/**`
- `data/fixtures/layer-snapshot.sample.json` only for visual labels/metadata
- `README.md` only if run/demo instructions change

Do not touch:

- PersonaTwin / `apps/web/verify/**`
- identity schemas, identity fixture, identity n8n workflow
- `db/migrations/**` unless absolutely necessary
- `contracts/**` unless a UI metadata field is strictly needed
- secrets, deployment, production config

## UX problems to fix

- Central map is too dark and visually weak.
- Paraná river must be obvious and attractive.
- Rosario, Gran Rosario, San Lorenzo, Arroyo Seco and Villa Constitución must be readable.
- Markers are too small / unclear.
- Source panel feels technical/raw.
- Inspector default state is poor.
- Timeline feels like a native form control.
- Layout needs stronger information hierarchy.
- Overall visual impression must be premium command-center, not developer debug screen.

## Design direction

- Premium operational dashboard.
- Dark navy / graphite base, but high contrast.
- Clear layer health cards.
- Polished city/river visual scene.
- Elegant fixture-mode banner.
- Better inspector summary before selection.
- Better selected-marker state.
- Better no-data/empty source states.
- Responsive enough for desktop demo.

## Requirements

Keep existing behavior:

- fixture loading works;
- layer toggles work;
- time slider/playback works;
- inspector click behavior works;
- source freshness remains visible;
- no fake live data;
- no browser polling of public APIs.

## Validation

Run:

```bash
node tests/validate-fixture.mjs
node tests/validate-identity-fixture.mjs
node --check apps/web/app.js
node --check apps/web/verify/verify.js
node --check apps/web/serve.mjs
```

## Acceptance criteria

Opening http://localhost:8080/apps/web/ must look like a serious product demo for a territorial 3D/4D digital twin.

The result should be good enough to show to a municipality, port operator, industrial client or sponsor without apologizing first.
