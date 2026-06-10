# Spec — Consent-based self-service identity verification

## Context

A request was raised to let users enter a DNI on the web and have agents compile a person's
data (with photo) into a digital twin. That original framing — looking up arbitrary people by
national ID and storing dossiers — is **out of scope and not built**: it is privacy-invasive
profiling of identifiable individuals and conflicts with Ley 25.326 (Protección de Datos
Personales).

This spec is the **legal, in-scope** version that was implemented instead.

## Scope (built)

Self-service identity verification: a person verifies **their own** identity with explicit
consent and views it as a personal digital twin.

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
6. **Auditability + ARCO rights.** Every action is audited; the subject can exercise access,
   rectification, opposition and **erasure** (demonstrated by the "Eliminar mis datos" action).

## Deliverables

- Contract: `contracts/identity-verification.schema.json` + `docs/identity-verification-contract.md`
- Fixture: `data/fixtures/identity-verification.sample.json` (synthetic test subject)
- DB: `db/migrations/002_identity_verification_schema.sql` (`identity` schema)
- n8n: `n8n/workflows/identity-verify-renaper.template.json` (consent gate → provider branch → persist → audit)
- Web: `apps/web/verify/` (consent screen → verification → personal digital twin / not-found / erased)
- Validation: `tests/validate-identity-fixture.mjs`
- Asset: `public/avatar-placeholder.svg` (generated, no real photo)

## Out of scope (explicitly not built)

- Looking up third parties by DNI.
- Scraping or aggregating public registries into person profiles.
- Storing or displaying real document photographs in demo/mock mode.
- Any flow that runs without recorded consent.

## Path to live

Operating in `live` mode requires: a signed convenio and credentials for the official identity
provider, an `APP_SALT` and privacy contact configured via environment, a deployed n8n + Postgres,
and a DPIA / registration consistent with Ley 25.326. None of these are included here.
