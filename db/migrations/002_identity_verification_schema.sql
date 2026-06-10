-- 002_identity_verification_schema.sql
-- Schema for consent-based SELF-SERVICE identity verification (KYC).
--
-- Scope & guardrails (Ley 25.326 — Protección de Datos Personales):
--   * This models a person verifying their OWN identity with explicit consent.
--     It is NOT a people-search / dossier store: there is no third-party lookup
--     table, and every profile row is tied to a recorded consent.
--   * Data minimization: the document number is stored as a salted hash
--     (subject_ref) for joins/lookups. Raw identity fields live only in
--     identity_profiles.payload, with a mandatory retention_until.
--   * The salt is an application secret supplied via environment at runtime and
--     is NEVER stored in this repository or in the database.
--   * Every read/write of personal data is auditable via identity.audit_log.
--   * Subjects can exercise ARCO rights; supports_erasure is implemented by
--     deleting identity_profiles rows (cascade-safe) while keeping a minimal,
--     non-identifying audit trail.
--   * Idempotent migration (IF NOT EXISTS / ON CONFLICT). No secrets, no grants.

BEGIN;

CREATE SCHEMA IF NOT EXISTS identity;

-- ---------------------------------------------------------------------------
-- consent_records: one row per consent the subject grants. Nothing may be
-- verified or stored without a matching consent row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.consent_records (
    id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Salted hash of the document number (sha256(numero || sexo || app_salt)).
    -- Never the raw DNI.
    subject_ref        text        NOT NULL,
    granted            boolean     NOT NULL DEFAULT true CHECK (granted),
    subject_confirmed_owner boolean NOT NULL DEFAULT true CHECK (subject_confirmed_owner),
    purpose            text        NOT NULL,
    legal_basis        text        NOT NULL DEFAULT 'Consentimiento del titular (Ley 25.326, art. 5)',
    terms_version      text        NOT NULL,
    channel            text        NOT NULL DEFAULT 'web',
    consented_at       timestamptz NOT NULL DEFAULT now(),
    expires_at         timestamptz,
    revoked_at         timestamptz,
    CONSTRAINT consent_expiry_after_grant CHECK (expires_at IS NULL OR expires_at > consented_at)
);

CREATE INDEX IF NOT EXISTS consent_subject_idx ON identity.consent_records (subject_ref, consented_at DESC);

-- ---------------------------------------------------------------------------
-- verification_requests: one row per verification attempt against a provider.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.verification_requests (
    id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    consent_id         bigint      NOT NULL REFERENCES identity.consent_records (id),
    subject_ref        text        NOT NULL,
    provider           text        NOT NULL,              -- 'renaper' | 'renaper-mock'
    mode               text        NOT NULL DEFAULT 'mock' CHECK (mode IN ('mock', 'live')),
    -- Idempotency key supplied by the caller (e.g. n8n execution id). Retrying
    -- the same request reuses the key instead of inserting twice.
    request_key        text        NOT NULL,
    status             text        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'not_found', 'failed')),
    match_score        numeric(4,3) CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 1)),
    requested_at       timestamptz NOT NULL DEFAULT now(),
    completed_at       timestamptz,
    error_message      text,
    CONSTRAINT verification_request_key UNIQUE (provider, request_key)
);

CREATE INDEX IF NOT EXISTS verification_subject_idx
    ON identity.verification_requests (subject_ref, requested_at DESC);

-- ---------------------------------------------------------------------------
-- identity_profiles: the verified self-data. The frontend "personal digital
-- twin" view consumes a document shaped by
-- contracts/identity-verification.schema.json built from this row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.identity_profiles (
    id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    verification_id    bigint      NOT NULL REFERENCES identity.verification_requests (id) ON DELETE CASCADE,
    subject_ref        text        NOT NULL,
    -- Minimized identity payload (names, document, domicilio, foto reference...).
    -- In mock mode this is synthetic. In live mode, only fields needed for the
    -- stated purpose are persisted.
    payload            jsonb       NOT NULL,
    photo_kind         text        NOT NULL DEFAULT 'placeholder'
        CHECK (photo_kind IN ('placeholder', 'official')),
    -- Pointer to the photo (URL / object-store key). Binary images are not
    -- stored inline. In mock mode this points at the generated placeholder.
    photo_ref          text,
    verified_at        timestamptz NOT NULL DEFAULT now(),
    -- Mandatory retention boundary; a scheduled job deletes rows past this.
    retention_until    timestamptz NOT NULL,
    CONSTRAINT identity_profile_unique_per_verification UNIQUE (verification_id),
    CONSTRAINT identity_profile_retention CHECK (retention_until > verified_at)
);

CREATE INDEX IF NOT EXISTS identity_profile_subject_idx ON identity.identity_profiles (subject_ref);
CREATE INDEX IF NOT EXISTS identity_profile_retention_idx ON identity.identity_profiles (retention_until);

-- ---------------------------------------------------------------------------
-- audit_log: append-only record of every action touching personal data.
-- Kept deliberately non-identifying (subject_ref hash only) so it can survive
-- profile erasure while still proving who-did-what-when.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.audit_log (
    id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_ref        text,
    action             text        NOT NULL
        CHECK (action IN ('consent_granted', 'consent_revoked', 'verification_requested',
                          'verification_completed', 'profile_viewed', 'profile_erased',
                          'data_exported', 'rectification_requested')),
    actor              text        NOT NULL DEFAULT 'self',
    detail             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_subject_idx ON identity.audit_log (subject_ref, occurred_at DESC);

COMMIT;
