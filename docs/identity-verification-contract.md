# Identity Verification Contract

Version: **1.0.0**
Schema: [`contracts/identity-verification.schema.json`](../contracts/identity-verification.schema.json)
Sample: [`data/fixtures/identity-verification.sample.json`](../data/fixtures/identity-verification.sample.json)

## What this is — and what it is not

This contract models **consent-based self-service identity verification**: a person verifies
**their own** identity and views it as a personal digital twin.

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

## Storage mapping

The result maps onto the `identity` schema from
[`db/migrations/002_identity_verification_schema.sql`](../db/migrations/002_identity_verification_schema.sql):

- `consent` → `identity.consent_records`
- `verification` → `identity.verification_requests` (unique on `provider` + `request_key`, so retries are idempotent)
- `subject` → `identity.identity_profiles.payload` (minimized; `retention_until` mandatory)
- every action → `identity.audit_log`

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
personal digital twin; try any other number to see the `not_found` state; use *Eliminar mis
datos* to exercise the right to erasure.
