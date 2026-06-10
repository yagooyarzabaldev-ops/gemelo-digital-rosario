# Spec — PersonaTwin (consent-based self-verification demo)

Product: **PersonaTwin / Gemelo Personal Verificado**

## Context

A request was raised to let users enter a DNI on the web and have agents compile a person's
data (with photo) into a digital twin. That original framing — looking up arbitrary people by
national ID and storing dossiers — is **out of scope and not built**: it is privacy-invasive
profiling of identifiable individuals and conflicts with Ley 25.326 (Protección de Datos
Personales).

What was built instead is a **synthetic demo with privacy safeguards** — not a "legal, no-problem"
DNI lookup. It never queries RENAPER or any real base; it uses only synthetic data.

## Scope (built)

Self-service identity verification: a person verifies **their own** identity with explicit
consent and views it as a personal digital twin (PersonaTwin).

Guardrails baked into the design:

1. **Self only.** The subject is always the requester. No third-party lookup table or flow.
2. **Consent gate.** Nothing is verified or stored unless the subject grants consent and
   confirms ownership. Enforced in the contract (`const: true`), the n8n workflow (hard reject),
   and the web form (required checkbox).
3. **Demo cannot target real people.** In `mock` mode only one synthetic test identity resolves;
   any other document returns `not_found`.
4. **No real provider call without authorization.** The RENAPER node is disabled by default and
   requires an official credential + convenio. No secrets in the repo.
5. **Data minimization + retention.** Only needed fields are stored; `retention_until` is
   mandatory; the document number is stored as a salted hash, not in the clear.
6. **Auditability + ARCO rights.** Every action is audited and the session audit trail is visible.
   The titular can exercise, as distinct demo flows:
   - **Acceso** — *Descargar mis datos*: local JSON export of profile + consent + verification +
     audit, labeled demo/synthetic (Ley 25.326 art. 14, 10 días corridos).
   - **Rectificación** — *Solicitar rectificación*: records a request + audit event, mutates no
     data (Ley 25.326 art. 16, 5 días hábiles).
   - **Revocación de consentimiento** — separate from erasure: marks consent revoked and blocks
     further use in the session; keeps a minimal audit event; does not imply deleting historical
     records.
   - **Supresión** — *Eliminar mis datos*: erases the displayed profile from the session, keeping
     a minimal non-identifying audit entry.

## Deliverables

- Contract: `contracts/identity-verification.schema.json` + `docs/identity-verification-contract.md`
- Fixture: `data/fixtures/identity-verification.sample.json` (synthetic test subject)
- DB: `db/migrations/002_identity_verification_schema.sql` (`identity` schema; audit actions include
  `data_exported` and `rectification_requested`)
- n8n: `n8n/workflows/identity-verify-renaper.template.json` (consent gate → provider branch → persist → audit)
- Web: `apps/web/verify/` (consent → verification → PersonaTwin; access/export, rectification,
  revocation, erasure; visible session audit trail)
- Validation: `tests/validate-identity-fixture.mjs`
- Asset: `public/avatar-placeholder.svg` (generated, no real photo)

## Out of scope (explicitly not built)

- Looking up third parties by DNI.
- Scraping or aggregating public registries into person profiles.
- Storing or displaying real document photographs in demo/mock mode.
- Any flow that runs without recorded consent.
- Any query to RENAPER or a real database (the demo is fully synthetic).

## Path to a real (live) deployment

This is a demo, not production. `live` mode would require, at minimum: an authorized provider and
a signed **convenio**; provider **credentials via environment**, never committed; an `APP_SALT`
and a real **privacy contact**; a **DPIA / legal review** and any **registration and obligations**
applicable under Ley 25.326; and a deployed **Postgres + n8n** backend doing verification
server-side. None of these are included here.
