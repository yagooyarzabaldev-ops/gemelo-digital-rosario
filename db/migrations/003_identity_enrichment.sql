-- 003_identity_enrichment.sql
-- Public-data enrichment of a self-verified subject's OWN profile.
--
-- Scope & guardrails (Ley 25.326):
--   * Enrichment is tied to a verification request (and therefore to a recorded
--     consent). It is the subject's OWN data, keyed by their own DNI/CUIL.
--   * It is NOT a people-search store: there is no third-party lookup. Rows only
--     exist for a consented self-verification.
--   * In demo/mock mode the data is synthetic and no real source is queried.
--   * Each source keeps status + freshness, and a mandatory retention_until.
--   * Idempotent migration. No secrets, no grants.

BEGIN;

CREATE TABLE IF NOT EXISTS identity.enrichment_records (
    id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    verification_id    bigint      NOT NULL REFERENCES identity.verification_requests (id) ON DELETE CASCADE,
    subject_ref        text        NOT NULL,                 -- salted hash, never the raw DNI
    source_id          text        NOT NULL,                 -- 'afip-padron', 'padron-electoral', ...
    source_name        text        NOT NULL,
    category           text        NOT NULL,                 -- fiscal | electoral | boletin_oficial | registro
    status             text        NOT NULL
        CHECK (status IN ('ok', 'ok_empty', 'stale', 'error', 'mock')),
    mode               text        NOT NULL DEFAULT 'mock' CHECK (mode IN ('mock', 'live')),
    last_success_at    timestamptz,
    last_error         text,
    -- Public records found for the subject at this source (label/value/detail).
    records            jsonb       NOT NULL DEFAULT '[]'::jsonb,
    retention_until    timestamptz NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    -- Re-running enrichment for the same source upserts instead of duplicating.
    CONSTRAINT enrichment_unique UNIQUE (verification_id, source_id),
    CONSTRAINT enrichment_retention CHECK (retention_until > created_at)
);

CREATE INDEX IF NOT EXISTS enrichment_subject_idx ON identity.enrichment_records (subject_ref);
CREATE INDEX IF NOT EXISTS enrichment_retention_idx ON identity.enrichment_records (retention_until);

-- Extend the audit action set with the enrichment event (idempotent recreate).
ALTER TABLE identity.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE identity.audit_log ADD CONSTRAINT audit_log_action_check
    CHECK (action IN ('consent_granted', 'consent_revoked', 'verification_requested',
                      'verification_completed', 'profile_viewed', 'profile_erased',
                      'data_exported', 'rectification_requested', 'enrichment_fetched'));

COMMIT;
