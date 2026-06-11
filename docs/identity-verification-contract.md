# PersonaTwin — Identity Verification Contract

Product: **PersonaTwin / Gemelo Personal Verificado**
Version: **1.1.0**
Schema: [`contracts/identity-verification.schema.json`](../contracts/identity-verification.schema.json)
Sample: [`data/fixtures/identity-verification.sample.json`](../data/fixtures/identity-verification.sample.json)

> This is a **synthetic demo with privacy safeguards** — not a "legal/no-problem"
> public-data lookup. The demo never queries RENAPER or any real database; it uses only
> synthetic data.

## What this is — and what it is not

This contract models **consent-based self-service identity verification**: a person verifies
**their own** identity and views it as a personal digital twin (PersonaTwin).

It is deliberately **not** a people-search / dossier format:

- There is no third-party lookup. The subject is always the requester.
- Verification requires explicit, owner-confirmed consent (`consent.granted` and
  `consent.subject_confirmed_owner` are both `true`, enforced by the schema as `const: true`).
- In demo (`mock`) mode the only identity that resolves is the single synthetic
  `demo_test_subject`; every other document returns `not_found`. The demo therefore cannot
  be pointed at real people.
- A real deployment performs verification **server-side** (n8n → authorized provider such as
  RENAPER under convenio) and never exposes provider credentials to the browser.

### Why this design (Ley 25.326)

Argentina's Personal Data Protection Act requires a lawful basis (here, the data subject's
consent) and bars building profiles of identifiable individuals without it. Aggregating public
records into a dossier keyed by DNI would violate that. This contract keeps the system on the
right side of the line by being self-only, consent-gated, minimized, retained for a bounded
period, auditable, and erasable.

## Document shape

| Field | Meaning |
|---|---|
| `contract` / `contract_version` | Discriminator + semver. |
| `request_id` | Identifier of this verification request. |
| `generated_at` | UTC ISO 8601 timestamp. |
| `mode` | `mock` (simulated provider, synthetic data) or `live` (authorized provider). The UI must show this prominently. |
| `disclaimer` | Required in `mock` mode. |
| `demo_test_subject` | Required in `mock` mode: the only `{documento_numero, sexo}` the demo will verify. |
| `consent` | `granted`, `subject_confirmed_owner` (both must be true), `purpose`, `legal_basis`, `terms_version`, `consented_at`, optional `expires_at`. |
| `verification` | `status` (`verified` / `not_found` / `failed` / `pending`), `provider`, `provider_label`, `verified_at`, `request_key` (idempotency key), `match_score`, `error`. |
| `subject` | Present only when `status = verified`. The subject's own minimized data: `documento`, `sexo`, `nombres`, `apellidos`, `cuil`, `fecha_nacimiento`, `nacionalidad`, `fallecido`, `domicilio` (with optional `lon`/`lat`), `foto`. |
| `source_status` | Per-provider status + freshness, same spirit as the layer-snapshot contract. |
| `governance` | `data_subject_rights` (ARCO statement), `rights_contact`, `retention_until`, `stored_fields_minimized`. |

### Photo handling

`subject.foto.kind` is `placeholder` or `official`. In `mock` mode it must be `placeholder`
(the schema and validator enforce this) — a generated image, never a real photograph. An
`official` document photo may only appear in authorized `live` mode.

### States the UI must represent

- **verified** → render the personal digital twin (identity card, domicilio mini-map, governance).
- **not_found** → clean "sin coincidencia" card. In demo, explain only the test DNI resolves.
- **failed** → provider/transport error, with `verification.error` shown; never fabricated data.
- **pending** → awaiting the provider.

## Public-data enrichment (v1.1, optional)

When the subject **consents to it**, the verified profile can be enriched with **public data
associated with their OWN DNI/CUIL**. This is self-service only — never a third-party lookup.

The optional `enrichment` block:

```jsonc
"enrichment": {
  "consented": true,                 // only present/true if the subject consented
  "sources": [
    {
      "source_id": "afip-padron",
      "name": "AFIP — Constancia de inscripción (CUIL/CUIT)",
      "category": "fiscal",          // fiscal | electoral | boletin_oficial | registro
      "url": "https://www.afip.gob.ar/",
      "status": "mock",              // ok | ok_empty | stale | error | mock
      "mode": "mock",                // every source is mock in demo mode
      "last_success_at": "…Z",
      "last_error": null,
      "records": [ { "label": "Condición", "value": "Monotributo", "detail": "Categoría B" } ]
    }
  ]
}
```

Rules:

- Present **only** with the subject's explicit enrichment consent (`consented: true`).
- In `mock` mode every source is `mock` and **makes no real query** (enforced by the validator).
- `status: "ok_empty"` with `records: []` is a valid "sin registros" state and must be rendered
  explicitly — not hidden, not as an error.
- Each source carries its own freshness and status, like the CityPulse source-freshness model.
- Enrichment is covered by the same governance: it is included in the data export, removed on
  erasure, and tied to a consent + retention boundary (`identity.enrichment_records`).

Going live (real AFIP / padrón / Boletín Oficial queries) requires authorized integration and
legal review, the same as PersonaTwin live in general.

## Data-subject rights flows (demo)

The verified view exposes the titular's ARCO rights as distinct, synthetic, non-persistent
actions:

- **Acceso / Descargar mis datos** — generates a local JSON export of the synthetic profile,
  consent record, verification request and the session audit trail. Labeled as demo / no
  RENAPER query. (Legal reference: Ley 25.326 art. 14 — response within 10 días corridos.)
- **Rectificación / Solicitar rectificación** — records a rectification *request* and an audit
  event without mutating any data. (Ley 25.326 art. 16 — response within 5 días hábiles.)
- **Revocación de consentimiento** — separate from erasure: marks consent revoked and blocks
  further verification/use in the session, keeping a minimal audit event. Revocation does **not**
  imply deletion of historical records the organization is obliged to keep.
- **Supresión / Eliminar mis datos** — erases the displayed profile from the session, keeping a
  minimal, non-identifying audit entry.

Each action appends to a visible **session audit trail** (`identity.audit_log` actions
`data_exported` and `rectification_requested` were added for the first two).

## Storage mapping

The result maps onto the `identity` schema from
[`db/migrations/002_identity_verification_schema.sql`](../db/migrations/002_identity_verification_schema.sql):

- `consent` → `identity.consent_records`
- `verification` → `identity.verification_requests` (unique on `provider` + `request_key`, so retries are idempotent)
- `subject` → `identity.identity_profiles.payload` (minimized; `retention_until` mandatory)
- `enrichment.sources[]` → `identity.enrichment_records` (unique per `verification_id` + `source_id`; cascade-deleted with the verification)
- every action → `identity.audit_log` (incl. `enrichment_fetched`)

The document number is stored as a salted hash (`subject_ref = sha256(numero || sexo || APP_SALT)`),
not in the clear; the salt is an environment secret and is never committed.

## Validation

```
node tests/validate-identity-fixture.mjs
```

checks structure, enums, ISO timestamps, the consent gate, the mock/photo rules, and that a
verified mock subject matches `demo_test_subject`.

## Demo flow (mock mode)

```
node apps/web/serve.mjs
# open http://localhost:8080/apps/web/verify/
```

The form is prefilled with the synthetic test DNI. Tick the consent box and verify to see the
PersonaTwin; try any other number to see the `not_found` state. From the verified view you can
exercise each right: *Descargar mis datos* (acceso), *Solicitar rectificación*, *Revocar
consentimiento*, *Eliminar mis datos* (supresión). Everything is synthetic and in-session — no
RENAPER query, no real data, no persistence.

## Path to a real (live) deployment

This demo is **not** production. Operating in `live` mode would require, at minimum:

- an authorized identity provider and a signed **convenio** (e.g. RENAPER);
- provider **credentials supplied via environment** (n8n credentials / env vars), never committed;
- an `APP_SALT` and a real **privacy contact**;
- a **DPIA / legal review** and any **registration and obligations** applicable under Ley 25.326;
- a deployed **Postgres + n8n** backend performing verification server-side.
