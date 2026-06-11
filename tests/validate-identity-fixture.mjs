// Validates data/fixtures/identity-verification.sample.json against the
// identity-verification contract (contracts/identity-verification.schema.json).
//
// Zero dependencies.
//
//   node tests/validate-identity-fixture.mjs            (validates the sample)
//   node tests/validate-identity-fixture.mjs <file>     (validates any result)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const target =
  process.argv[2] ?? resolve(REPO_ROOT, "data", "fixtures", "identity-verification.sample.json");

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const isIso = (s) => typeof s === "string" && ISO_RE.test(s) && !Number.isNaN(Date.parse(s));
const isIsoOrNull = (s) => s === null || isIso(s);

const VERIF_STATUSES = ["verified", "not_found", "failed", "pending"];
const SOURCE_STATUSES = ["ok", "stale", "error", "mock", "disabled"];

let doc;
try {
  doc = JSON.parse(readFileSync(target, "utf8"));
} catch (err) {
  console.error(`FAIL: cannot read/parse ${target}: ${err.message}`);
  process.exit(1);
}

/* ---- top level ---- */
check(doc.contract === "identity-verification", `contract must be "identity-verification"`);
check(/^\d+\.\d+\.\d+$/.test(doc.contract_version ?? ""), "contract_version must be semver");
check(typeof doc.request_id === "string" && doc.request_id.length > 0, "request_id required");
check(isIso(doc.generated_at), "generated_at must be ISO timestamp");
check(["mock", "live"].includes(doc.mode), "mode must be mock|live");
if (doc.mode === "mock") {
  check(typeof doc.disclaimer === "string" && doc.disclaimer.length > 0,
    "mock mode requires a disclaimer (synthetic data, simulated provider)");
  check(doc.demo_test_subject && typeof doc.demo_test_subject.documento_numero === "string",
    "mock mode requires demo_test_subject (the single identity the demo will verify)");
}

/* ---- consent (gate for any processing) ---- */
const c = doc.consent ?? {};
check(c.granted === true, "consent.granted must be true — no verification without consent");
check(c.subject_confirmed_owner === true, "consent.subject_confirmed_owner must be true — self-verification only");
check(typeof c.purpose === "string" && c.purpose.length > 0, "consent.purpose required");
check(typeof c.legal_basis === "string" && c.legal_basis.length > 0, "consent.legal_basis required");
check(typeof c.terms_version === "string" && c.terms_version.length > 0, "consent.terms_version required");
check(isIso(c.consented_at), "consent.consented_at must be ISO timestamp");
check(c.expires_at === undefined || isIsoOrNull(c.expires_at), "consent.expires_at must be ISO or null");

/* ---- verification ---- */
const v = doc.verification ?? {};
check(VERIF_STATUSES.includes(v.status), `verification.status must be one of ${VERIF_STATUSES.join("|")}`);
check(typeof v.provider === "string" && v.provider.length > 0, "verification.provider required");
check(isIsoOrNull(v.verified_at), "verification.verified_at must be ISO or null");
check(typeof v.request_key === "string" && v.request_key.length > 0, "verification.request_key required");
check(v.error === null || typeof v.error === "string", "verification.error must be string or null");
check(v.match_score === undefined || v.match_score === null ||
  (typeof v.match_score === "number" && v.match_score >= 0 && v.match_score <= 1),
  "verification.match_score must be 0..1 or null");
if (v.status === "failed") {
  check(typeof v.error === "string" && v.error.length > 0, "a failed verification must explain itself via error");
}

/* ---- subject (only required when verified) ---- */
if (v.status === "verified") {
  const s = doc.subject;
  check(s && typeof s === "object", "verified result must include subject");
  if (s) {
    check(s.documento?.tipo === "DNI", "subject.documento.tipo must be DNI");
    check(/^\d{7,8}$/.test(s.documento?.numero ?? ""), "subject.documento.numero must be 7-8 digits");
    check(["F", "M", "X"].includes(s.sexo), "subject.sexo must be F|M|X");
    check(typeof s.nombres === "string" && s.nombres.length > 0, "subject.nombres required");
    check(typeof s.apellidos === "string" && s.apellidos.length > 0, "subject.apellidos required");
    check(s.fecha_nacimiento == null || /^\d{4}-\d{2}-\d{2}$/.test(s.fecha_nacimiento),
      "subject.fecha_nacimiento must be YYYY-MM-DD or null");
    if (s.domicilio && s.domicilio.lon != null) {
      check(s.domicilio.lon >= -180 && s.domicilio.lon <= 180, "subject.domicilio.lon out of range");
      check(s.domicilio.lat >= -90 && s.domicilio.lat <= 90, "subject.domicilio.lat out of range");
    }
    if (s.foto) {
      check(["placeholder", "official"].includes(s.foto.kind), "subject.foto.kind must be placeholder|official");
      if (doc.mode === "mock") {
        check(s.foto.kind === "placeholder", "mock mode must never expose an official photo");
      }
    }
    // self-verification integrity: the verified document must match the demo subject
    if (doc.mode === "mock" && doc.demo_test_subject) {
      check(s.documento.numero === doc.demo_test_subject.documento_numero,
        "verified subject document must equal demo_test_subject in mock mode");
    }
  }
}

/* ---- source_status ---- */
const sources = doc.source_status ?? [];
check(Array.isArray(sources) && sources.length > 0, "source_status must be a non-empty array");
for (const [i, s] of sources.entries()) {
  const at = `source_status[${i}] (${s?.source_id ?? "?"})`;
  check(typeof s.source_id === "string" && s.source_id.length > 0, `${at}: source_id required`);
  check(typeof s.name === "string" && s.name.length > 0, `${at}: name required`);
  check(SOURCE_STATUSES.includes(s.status), `${at}: status must be one of ${SOURCE_STATUSES.join("|")}`);
  check(["mock", "live"].includes(s.mode), `${at}: mode must be mock|live`);
  check(isIsoOrNull(s.last_success_at), `${at}: last_success_at must be ISO or null`);
  check(s.last_error === null || typeof s.last_error === "string", `${at}: last_error must be string or null`);
}

/* ---- governance ---- */
const g = doc.governance ?? {};
check(typeof g.data_subject_rights === "string" && g.data_subject_rights.length > 0,
  "governance.data_subject_rights required (ARCO rights statement)");
check(typeof g.rights_contact === "string" && g.rights_contact.length > 0, "governance.rights_contact required");
check(g.retention_until === undefined || isIsoOrNull(g.retention_until),
  "governance.retention_until must be ISO or null");

/* ---- enrichment (optional; public-data of the subject's OWN id) ---- */
const ENRICH_STATUSES = ["ok", "ok_empty", "stale", "error", "mock"];
let enrichCount = 0;
if (doc.enrichment !== undefined) {
  const e = doc.enrichment;
  check(e.consented === true, "enrichment requires consented=true (self-service, consent-covered)");
  check(Array.isArray(e.sources), "enrichment.sources must be an array");
  for (const [i, s] of (e.sources ?? []).entries()) {
    const at = `enrichment.sources[${i}] (${s?.source_id ?? "?"})`;
    check(typeof s.source_id === "string" && s.source_id.length > 0, `${at}: source_id required`);
    check(typeof s.name === "string" && s.name.length > 0, `${at}: name required`);
    check(typeof s.category === "string" && s.category.length > 0, `${at}: category required`);
    check(ENRICH_STATUSES.includes(s.status), `${at}: status must be one of ${ENRICH_STATUSES.join("|")}`);
    check(["mock", "live"].includes(s.mode), `${at}: mode must be mock|live`);
    if (doc.mode === "mock") check(s.mode === "mock", `${at}: in mock mode every enrichment source must be mock (no real query)`);
    check(isIsoOrNull(s.last_success_at), `${at}: last_success_at must be ISO or null`);
    check(s.last_error === null || typeof s.last_error === "string", `${at}: last_error must be string or null`);
    check(Array.isArray(s.records), `${at}: records must be an array`);
    if (s.status === "ok_empty") check(s.records.length === 0, `${at}: ok_empty sources must have zero records`);
    for (const [ri, r] of (s.records ?? []).entries()) {
      check(typeof r.label === "string" && r.label.length > 0, `${at}.records[${ri}]: label required`);
      check(typeof r.value === "string", `${at}.records[${ri}]: value must be a string`);
    }
    enrichCount++;
  }
}

/* ---- result ---- */
if (errors.length) {
  console.error(`FAIL: ${target}`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log(`OK: ${target}`);
console.log(`  contract v${doc.contract_version}, mode=${doc.mode}`);
console.log(`  verification: ${v.status} via ${v.provider}`);
console.log(`  consent: granted=${c.granted}, owner=${c.subject_confirmed_owner}, basis="${c.legal_basis}"`);
if (doc.enrichment !== undefined) {
  console.log(`  enrichment: consented=${doc.enrichment.consented}, sources=${enrichCount} (${(doc.enrichment.sources ?? []).map((s) => `${s.source_id}:${s.status}`).join(", ")})`);
}
