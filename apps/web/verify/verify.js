/* PersonaTwin — Gemelo Personal Verificado
 *
 * Consent-based SELF-verification demo. The subject verifies their OWN identity
 * and sees it as a personal digital twin. This is NOT a people-search / public
 * DNI lookup.
 *
 *   - This demo NEVER queries RENAPER or any real database. It uses only the
 *     synthetic test subject in the fixture; any other document returns a clean
 *     "not found" state, so it cannot profile real people.
 *   - In a real deployment the verification runs server-side (n8n -> authorized
 *     provider under convenio); the browser only renders the returned document,
 *     which has the same shape as this fixture.
 *
 * Privacy-rights flows demonstrated client-side (synthetic, non-persistent):
 *   acceso/exportación · rectificación · revocación de consentimiento · supresión.
 */
"use strict";

const FIXTURE_URL = "../../../data/fixtures/identity-verification.sample.json";

const session = {
  template: null,     // the fixture (baseline granted state)
  active: null,       // current verified document being shown
  consentRevoked: false,
  audit: [],          // session audit trail: { action, actor, occurred_at, detail }
};

const $ = (id) => document.getElementById(id);
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const audit = (action, detail) =>
  session.audit.push({ action, actor: "self", occurred_at: nowIso(), detail: detail ?? {} });

async function init() {
  try {
    const res = await fetch(FIXTURE_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    session.template = await res.json();
  } catch (err) {
    const el = $("load-error");
    el.hidden = false;
    el.textContent =
      "No se pudo cargar el recurso de demostración.\n\n" +
      `${err.message}\n\n` +
      "Serví el repositorio por HTTP:\n" +
      "node apps/web/serve.mjs\n" +
      "y abrí http://localhost:8080/apps/web/verify/";
    return;
  }
  renderModeBanner();
  prefillDemo();
  $("verify-form").addEventListener("submit", onSubmit);
}

function renderModeBanner() {
  const t = session.template;
  const el = $("mode-banner");
  el.hidden = false;
  el.classList.add(t.mode);
  el.title = t.disclaimer ?? "";
  el.innerHTML =
    t.mode === "mock"
      ? `<span class="pill-dot"></span>Modo demo<span class="pill-sub">· proveedor simulado</span>`
      : `<span class="pill-dot"></span>Modo live`;
}

function prefillDemo() {
  const t = session.template;
  if (t.mode === "mock" && t.demo_test_subject) {
    $("dni").value = t.demo_test_subject.documento_numero;
    $("sexo").value = t.demo_test_subject.sexo;
    $("demo-hint").textContent =
      `Demo: sólo se verifica el DNI sintético ${t.demo_test_subject.documento_numero} (${t.demo_test_subject.sexo}). ` +
      `No se consulta RENAPER ni ninguna base real.`;
  }
}

/* ================= verification ================= */

function onSubmit(e) {
  e.preventDefault();
  const err = $("form-error");
  err.hidden = true;

  if (session.consentRevoked) {
    return showError("Revocaste el consentimiento en esta sesión. Iniciá una nueva sesión de demo para volver a verificar.");
  }
  const dni = $("dni").value.replace(/\D/g, "");
  const sexo = $("sexo").value;
  if (!/^\d{7,8}$/.test(dni)) {
    return showError("Ingresá un número de documento válido (7 u 8 dígitos).");
  }
  if (!$("consent").checked) {
    return showError("Necesitás confirmar que sos el titular y otorgar tu consentimiento.");
  }

  audit("consent_granted", { terms_version: session.template.consent.terms_version });
  audit("verification_requested", { mode: session.template.mode });

  $("step-consent").hidden = true;
  $("step-loading").hidden = false;
  setTimeout(() => resolveVerification(dni, sexo), 850);
}

function showError(msg) {
  const err = $("form-error");
  err.textContent = msg;
  err.hidden = false;
}

// Mock provider: only the declared synthetic test subject verifies.
function resolveVerification(dni, sexo) {
  const t = session.template;
  const test = t.demo_test_subject;
  const isMatch = t.mode === "mock" && test && dni === test.documento_numero && sexo === test.sexo;

  const result = structuredClone(t);
  result.generated_at = nowIso();

  if (!isMatch) {
    result.verification = { ...result.verification, status: "not_found", verified_at: null, match_score: null, error: null };
    delete result.subject;
    audit("verification_completed", { status: "not_found" });
  } else {
    result.verification = { ...result.verification, status: "verified", verified_at: nowIso(), match_score: 1.0 };
    audit("verification_completed", { status: "verified" });
    audit("profile_viewed", {});
  }
  session.active = result;

  $("step-loading").hidden = true;
  $("step-result").hidden = false;
  renderResult(result);
}

/* ================= result rendering ================= */

function renderResult(doc) {
  const host = $("step-result");
  host.innerHTML = "";

  host.appendChild(el(`<div class="disclaimer-strip">⚠ Este demo no consulta RENAPER ni bases reales. Sólo usa datos sintéticos. ${esc(doc.disclaimer ?? "")}</div>`));

  if (doc.verification.status !== "verified") {
    renderNotFound(host, doc);
    appendAuditPanel(host);
    return;
  }

  const s = doc.subject;
  const v = doc.verification;
  const fullName = `${s.nombres} ${s.apellidos}`;

  host.appendChild(el(`
    <div class="profile-card">
      <div class="photo-wrap">
        <img class="profile-photo" alt="Avatar generado" src="${esc(s.foto?.uri ?? "")}" />
        <span class="photo-note">${esc(s.foto?.note ?? "")}</span>
      </div>
      <div class="profile-head">
        <div class="profile-kicker">PersonaTwin · Gemelo Personal Verificado · titular</div>
        <div class="profile-name">${esc(fullName)}</div>
        <div class="verif-line">
          <span class="badge ${esc(v.status)}">${esc(v.status)}</span>
          <span class="badge ${esc(doc.mode)}">${esc(doc.mode === "mock" ? "demo" : "live")}</span>
          <span style="font-size:.78rem;color:var(--muted)">vía ${esc(v.provider_label ?? v.provider)}</span>
        </div>
      </div>
    </div>`));

  const dom = s.domicilio ?? {};
  const domLine = [dom.calle, dom.numero, dom.piso].filter(Boolean).join(" ");
  const domCity = [dom.ciudad, dom.provincia, dom.codigo_postal].filter(Boolean).join(", ");
  host.appendChild(el(`
    <div class="detail-grid">
      ${cell("Documento", `${s.documento.tipo} ${formatDni(s.documento.numero)}`)}
      ${cell("Sexo", s.sexo)}
      ${cell("Fecha de nacimiento", s.fecha_nacimiento ?? "—")}
      ${cell("Nacionalidad", s.nacionalidad ?? "—")}
      ${cell("CUIL", s.cuil ?? "—")}
      ${cell("Ejemplar", s.documento.ejemplar ?? "—")}
      ${cellFull("Domicilio", [domLine, domCity].filter(Boolean).join(" · ") || "—")}
    </div>`));

  if (dom.lon != null && dom.lat != null) {
    const mapCard = el(`<div class="map-card"><span class="map-tag">Domicilio · ${esc(dom.ciudad ?? "")}</span><canvas></canvas></div>`);
    host.appendChild(mapCard);
    drawMiniMap(mapCard.querySelector("canvas"), dom.lon, dom.lat);
  }

  const g = doc.governance;
  host.appendChild(el(`
    <div class="gov-card">
      <h3>Gobernanza de datos</h3>
      <div class="gov-row"><span>Finalidad</span><span>${esc(doc.consent.purpose)}</span></div>
      <div class="gov-row"><span>Base legal</span><span>${esc(doc.consent.legal_basis)}</span></div>
      <div class="gov-row"><span>Consentimiento</span><span>otorgado ${esc(fmtDate(doc.consent.consented_at))}</span></div>
      <div class="gov-row"><span>Conservación hasta</span><span>${esc(fmtDate(g.retention_until))}</span></div>
      <div class="gov-row"><span>Derechos (ARCO)</span><span>${esc(g.rights_contact)}</span></div>
      <p style="margin:10px 0 0">${esc(g.data_subject_rights)}</p>
    </div>`));

  // titular rights actions
  host.appendChild(el(`
    <div class="rights">
      <h3 class="rights-title">Tus derechos sobre estos datos</h3>
      <div class="actions">
        <button class="btn-ghost" id="export-btn">⬇ Descargar mis datos</button>
        <button class="btn-ghost" id="rectify-btn">✎ Solicitar rectificación</button>
        <button class="btn-warn" id="revoke-btn">⦸ Revocar consentimiento</button>
        <button class="btn-danger" id="erase-btn">🗑 Eliminar mis datos</button>
        <button class="btn-ghost" id="restart-btn">↻ Nueva verificación</button>
      </div>
      <div id="rectify-panel" hidden></div>
      <div id="toast" class="toast" hidden></div>
    </div>`));

  appendAuditPanel(host);

  $("export-btn").addEventListener("click", () => exportData(doc));
  $("rectify-btn").addEventListener("click", toggleRectify);
  $("revoke-btn").addEventListener("click", revokeConsent);
  $("erase-btn").addEventListener("click", eraseData);
  $("restart-btn").addEventListener("click", restart);
}

function renderNotFound(host, doc) {
  const test = doc.demo_test_subject;
  host.appendChild(el(`
    <div class="empty-state">
      <h2>Sin coincidencia</h2>
      <p>El proveedor simulado no encontró una identidad para el documento ingresado.
      ${doc.mode === "mock"
        ? `En este demo sólo se verifica el DNI sintético <strong>${esc(test.documento_numero)} (${esc(test.sexo)})</strong>; por diseño no se consultan personas reales ni RENAPER.`
        : `Verificá los datos e intentá nuevamente.`}</p>
      <div class="actions"><button class="btn-ghost" id="restart-btn">Volver a intentar</button></div>
    </div>`));
  $("restart-btn").addEventListener("click", restart);
}

/* ================= rights: access / export ================= */

function exportData(doc) {
  const s = doc.subject;
  const bundle = {
    export_type: "personatwin-demo-data-export",
    disclaimer: "DEMO sintético. No se consultó RENAPER ni ninguna base real. Los datos no corresponden a una persona real.",
    generated_at: nowIso(),
    right_exercised: "Acceso (Ley 25.326, art. 14 — plazo de respuesta: 10 días corridos).",
    subject_profile: s,
    consent_record: {
      subject_ref: "sha256(documento||sexo||APP_SALT) — calculado server-side; no se expone en el demo",
      granted: true,
      subject_confirmed_owner: true,
      purpose: doc.consent.purpose,
      legal_basis: doc.consent.legal_basis,
      terms_version: doc.consent.terms_version,
      consented_at: doc.consent.consented_at,
      expires_at: doc.consent.expires_at ?? null,
      revoked_at: session.consentRevoked ? nowIso() : null,
    },
    verification_request: {
      provider: doc.verification.provider,
      mode: doc.mode,
      request_key: doc.verification.request_key,
      status: doc.verification.status,
      match_score: doc.verification.match_score ?? null,
      requested_at: doc.consent.consented_at,
      completed_at: doc.verification.verified_at,
    },
    audit_events: session.audit,
    governance: doc.governance,
  };

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "personatwin-export-demo.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  audit("data_exported", { format: "json", right: "acceso" });
  renderAudit();
  toast("Descarga generada: personatwin-export-demo.json · demo sintético, sin consulta a RENAPER.", "ok");
}

/* ================= rights: rectification ================= */

function toggleRectify() {
  const panel = $("rectify-panel");
  if (!panel.hidden) { panel.hidden = true; panel.innerHTML = ""; return; }
  panel.hidden = false;
  panel.innerHTML = `
    <div class="rectify-box">
      <p class="rectify-lead">Solicitá la corrección de un dato. <strong>No se modifican datos reales</strong>:
      en este demo se registra la solicitud y un evento de auditoría.</p>
      <div class="field-row">
        <label class="field">
          <span class="field-label">Dato a rectificar</span>
          <select id="rectify-field">
            <option value="domicilio">Domicilio</option>
            <option value="nombres">Nombres</option>
            <option value="apellidos">Apellidos</option>
            <option value="fecha_nacimiento">Fecha de nacimiento</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Valor solicitado</span>
          <input id="rectify-value" placeholder="Nuevo valor" maxlength="120" />
        </label>
      </div>
      <label class="field">
        <span class="field-label">Motivo (opcional)</span>
        <input id="rectify-reason" placeholder="p. ej. mudanza" maxlength="160" />
      </label>
      <div class="actions">
        <button class="btn-primary slim" id="rectify-submit">Enviar solicitud</button>
        <button class="btn-ghost" id="rectify-cancel">Cancelar</button>
      </div>
    </div>`;
  $("rectify-submit").addEventListener("click", submitRectify);
  $("rectify-cancel").addEventListener("click", toggleRectify);
}

function submitRectify() {
  const field = $("rectify-field").value;
  const value = $("rectify-value").value.trim();
  if (!value) { toast("Indicá el valor solicitado para la rectificación.", "warn"); return; }
  const reason = $("rectify-reason").value.trim();

  // Non-persistent: record the request + audit event; never mutate the profile.
  audit("rectification_requested", { field, requested_value: value, reason: reason || null });
  renderAudit();
  $("rectify-panel").hidden = true;
  $("rectify-panel").innerHTML = "";
  toast(`Solicitud de rectificación de "${field}" registrada (demo). Plazo legal de respuesta: 5 días hábiles (Ley 25.326, art. 16). No se modifican datos reales.`, "ok");
}

/* ================= rights: revocation ================= */

function revokeConsent() {
  session.consentRevoked = true;
  audit("consent_revoked", {});

  const host = $("step-result");
  host.innerHTML = "";
  host.appendChild(el(`
    <div class="empty-state revoked">
      <h2>Consentimiento revocado</h2>
      <p>No se realizará ningún nuevo tratamiento de tus datos en esta sesión.</p>
      <p>La revocación <strong>no es lo mismo que borrar todo</strong>: puede implicar bloquear nuevos usos
      y conservar un registro mínimo de auditoría que la organización está obligada a mantener. Para borrar
      tus datos, usá <strong>“Eliminar mis datos”</strong> (derecho de supresión).</p>
      <div class="actions">
        <button class="btn-ghost" id="export-btn">⬇ Descargar mis datos</button>
        <button class="btn-danger" id="erase-btn">🗑 Eliminar mis datos</button>
        <button class="btn-ghost" id="newsession-btn">↻ Iniciar nueva sesión de demo</button>
      </div>
      <div id="toast" class="toast" hidden></div>
    </div>`));
  appendAuditPanel(host);

  $("export-btn").addEventListener("click", () => exportData(session.active));
  $("erase-btn").addEventListener("click", eraseData);
  $("newsession-btn").addEventListener("click", newSession);
}

/* ================= rights: erasure ================= */

function eraseData() {
  audit("profile_erased", {});
  // Drop the profile from in-memory state too, so nothing keeps holding the
  // full personal data after erasure (not just a visual clear).
  if (session.active) {
    session.active.subject = { erased: true, note: "Perfil eliminado por el titular (supresión)." };
    session.active.verification = { ...session.active.verification, status: "erased" };
  }
  const host = $("step-result");
  host.innerHTML = "";
  host.appendChild(el(`
    <div class="empty-state erased">
      <h2>Datos eliminados</h2>
      <p>Se ejerció el derecho de <strong>supresión</strong>: los datos personales mostrados fueron borrados de esta sesión.
      En una implementación real, esta acción elimina el perfil en <strong>identity.identity_profiles</strong> y deja un
      registro mínimo y no identificante en la auditoría.</p>
      <div class="actions">
        <button class="btn-ghost" id="export-btn">⬇ Descargar registro de auditoría</button>
        <button class="btn-ghost" id="newsession-btn">↻ Iniciar nueva sesión de demo</button>
      </div>
      <div id="toast" class="toast" hidden></div>
    </div>`));
  appendAuditPanel(host);

  // After erasure the profile is gone; session.active.subject is already the
  // erased marker, so the export carries only the audit trail + consent meta.
  $("export-btn").addEventListener("click", () => exportData(session.active));
  $("newsession-btn").addEventListener("click", newSession);
}

/* ================= audit panel ================= */

const ACTION_LABELS = {
  consent_granted: "Consentimiento otorgado",
  verification_requested: "Verificación solicitada",
  verification_completed: "Verificación completada",
  profile_viewed: "Perfil visualizado",
  data_exported: "Datos exportados (acceso)",
  rectification_requested: "Rectificación solicitada",
  consent_revoked: "Consentimiento revocado",
  profile_erased: "Datos eliminados (supresión)",
};

function appendAuditPanel(host) {
  host.appendChild(el(`
    <div class="audit-card">
      <h3>Registro de actividad (auditoría de la sesión)</h3>
      <ul id="audit-list" class="audit-list"></ul>
    </div>`));
  renderAudit();
}

function renderAudit() {
  const ul = $("audit-list");
  if (!ul) return;
  if (!session.audit.length) {
    ul.innerHTML = `<li class="muted">Sin eventos todavía.</li>`;
    return;
  }
  ul.innerHTML = session.audit
    .map(( evt) => {
      const detail = Object.entries(evt.detail ?? {})
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
      return `<li><span class="audit-time">${esc(evt.occurred_at.slice(11, 19))}</span>` +
        `<span class="audit-action">${esc(ACTION_LABELS[evt.action] ?? evt.action)}</span>` +
        (detail ? `<span class="audit-detail">${esc(detail)}</span>` : "") + `</li>`;
    })
    .join("");
}

/* ================= toast ================= */

let toastTimer = null;
function toast(msg, kind) {
  const t = $("toast");
  if (!t) return;
  t.className = `toast ${kind ?? ""}`;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}

/* ================= session control ================= */

function restart() {
  // New verification within the same demo session (audit keeps accumulating).
  $("step-result").hidden = true;
  $("step-result").innerHTML = "";
  $("step-consent").hidden = false;
  $("form-error").hidden = true;
  $("consent").checked = false;
}

function newSession() {
  // Full reset: clears the session audit trail and the revoked state.
  session.active = null;
  session.consentRevoked = false;
  session.audit = [];
  restart();
}

/* ================= mini-map ================= */

function drawMiniMap(canvas, lon, lat) {
  const bbox = [-60.95, -33.35, -60.20, -32.55];
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 700, h = 200;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const [west, south, east, north] = bbox;
  const midLat = (south + north) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const pad = 24;
  const scale = Math.min((w - 2 * pad) / ((east - west) * kx), (h - 2 * pad) / (north - south));
  const offX = (w - (east - west) * kx * scale) / 2;
  const offY = (h - (north - south) * scale) / 2;
  const project = (lo, la) => [offX + (lo - west) * kx * scale, offY + (north - la) * scale];

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#13203c"); grad.addColorStop(1, "#0d1528");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

  const river = [[-60.755,-32.580],[-60.705,-32.780],[-60.625,-32.940],[-60.520,-33.100],[-60.360,-33.215],[-60.300,-33.260]];
  ctx.strokeStyle = "rgba(80, 160, 255, 0.5)"; ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  river.forEach(([lo, la], i) => { const [x, y] = project(lo, la); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();

  const [px, py] = project(lon, lat);
  const g = ctx.createRadialGradient(px, py, 0, px, py, 30);
  g.addColorStop(0, "rgba(79, 210, 255, 0.4)"); g.addColorStop(1, "rgba(79, 210, 255, 0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4fd2ff"; ctx.strokeStyle = "#0b1120"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

/* ================= helpers ================= */

function el(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}
function cell(k, v) { return `<div class="detail-cell"><div class="detail-k">${esc(k)}</div><div class="detail-v">${esc(v)}</div></div>`; }
function cellFull(k, v) { return `<div class="detail-cell full"><div class="detail-k">${esc(k)}</div><div class="detail-v">${esc(v)}</div></div>`; }

function formatDni(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
function fmtDate(iso) { return iso ? new Date(iso).toISOString().slice(0, 10) : "—"; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

init();
