/* Verificación de identidad — CityPulse 4D
 *
 * Consent-based SELF-verification demo. The subject verifies their OWN identity
 * and sees it as a personal digital twin. This is NOT a people-search tool:
 *
 *   - In demo (mock) mode the only identity that resolves is the synthetic test
 *     subject declared in the fixture (demo_test_subject). Any other document
 *     returns a clean "not found" state, so the demo cannot profile real people.
 *   - In a real deployment the verification is performed server-side by the n8n
 *     workflow against an authorized provider (RENAPER under convenio); the
 *     browser would POST the consented request and render the returned document,
 *     which has the same shape as this fixture.
 */
"use strict";

const FIXTURE_URL = "../../../data/fixtures/identity-verification.sample.json";

const state = { template: null };

const $ = (id) => document.getElementById(id);

async function init() {
  try {
    const res = await fetch(FIXTURE_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.template = await res.json();
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
  const t = state.template;
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
  const t = state.template;
  if (t.mode === "mock" && t.demo_test_subject) {
    $("dni").value = t.demo_test_subject.documento_numero;
    $("sexo").value = t.demo_test_subject.sexo;
    $("demo-hint").textContent =
      `Demo: sólo se verifica el DNI de prueba ${t.demo_test_subject.documento_numero} (${t.demo_test_subject.sexo}). ` +
      `Cualquier otro documento devuelve "sin coincidencia".`;
  }
}

function onSubmit(e) {
  e.preventDefault();
  const err = $("form-error");
  err.hidden = true;

  const dni = $("dni").value.replace(/\D/g, "");
  const sexo = $("sexo").value;
  if (!/^\d{7,8}$/.test(dni)) {
    return showError("Ingresá un número de documento válido (7 u 8 dígitos).");
  }
  if (!$("consent").checked) {
    return showError("Necesitás confirmar que sos el titular y otorgar tu consentimiento.");
  }

  // Move to the loading step, then resolve against the (mock) provider.
  $("step-consent").hidden = true;
  $("step-loading").hidden = false;
  setTimeout(() => resolveVerification(dni, sexo), 850);
}

function showError(msg) {
  const err = $("form-error");
  err.textContent = msg;
  err.hidden = false;
}

// Mock provider resolution: only the declared test subject verifies.
function resolveVerification(dni, sexo) {
  const t = state.template;
  const test = t.demo_test_subject;
  const isMatch = t.mode === "mock" && test && dni === test.documento_numero && sexo === test.sexo;

  const result = structuredClone(t);
  result.generated_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  if (!isMatch) {
    result.verification = {
      ...result.verification,
      status: "not_found",
      verified_at: null,
      match_score: null,
      error: null,
    };
    delete result.subject;
  }

  $("step-loading").hidden = true;
  $("step-result").hidden = false;
  renderResult(result);
}

/* ---------------- result rendering ---------------- */

function renderResult(doc) {
  const host = $("step-result");
  host.innerHTML = "";

  if (doc.mode === "mock" && doc.disclaimer) {
    host.appendChild(el(`<div class="disclaimer-strip">⚠ ${esc(doc.disclaimer)}</div>`));
  }

  if (doc.verification.status !== "verified") {
    renderNotFound(host, doc);
    return;
  }

  const s = doc.subject;
  const v = doc.verification;
  const fullName = `${s.nombres} ${s.apellidos}`;

  // profile card (photo + identity head)
  const card = el(`
    <div class="profile-card">
      <div class="photo-wrap">
        <img class="profile-photo" alt="Avatar generado" src="${esc(s.foto?.uri ?? "")}" />
        <span class="photo-note">${esc(s.foto?.note ?? "")}</span>
      </div>
      <div class="profile-head">
        <div class="profile-kicker">Gemelo digital personal · titular verificado</div>
        <div class="profile-name">${esc(fullName)}</div>
        <div class="verif-line">
          <span class="badge ${esc(v.status)}">${esc(v.status)}</span>
          <span class="badge ${esc(doc.mode)}">${esc(doc.mode === "mock" ? "demo" : "live")}</span>
          <span class="muted" style="font-size:.78rem;color:var(--muted)">vía ${esc(v.provider_label ?? v.provider)}</span>
        </div>
      </div>
    </div>`);
  host.appendChild(card);

  // detail grid
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

  // mini-map of the domicilio over the region
  if (dom.lon != null && dom.lat != null) {
    const mapCard = el(`<div class="map-card"><span class="map-tag">Domicilio · ${esc(dom.ciudad ?? "")}</span><canvas></canvas></div>`);
    host.appendChild(mapCard);
    drawMiniMap(mapCard.querySelector("canvas"), dom.lon, dom.lat);
  }

  // governance card
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

  // actions: ARCO erasure + new verification
  const actions = el(`<div class="actions">
    <button class="btn-danger" id="erase-btn">Eliminar mis datos (supresión)</button>
    <button class="btn-ghost" id="restart-btn">Nueva verificación</button>
  </div>`);
  host.appendChild(actions);
  $("erase-btn").addEventListener("click", () => eraseData(doc));
  $("restart-btn").addEventListener("click", restart);
}

function renderNotFound(host, doc) {
  const test = doc.demo_test_subject;
  host.appendChild(el(`
    <div class="empty-state">
      <h2>Sin coincidencia</h2>
      <p>El proveedor no encontró una identidad para el documento ingresado.
      ${doc.mode === "mock"
        ? `En modo demo sólo se verifica el DNI de prueba <strong>${esc(test.documento_numero)} (${esc(test.sexo)})</strong>; por diseño no se consultan personas reales.`
        : `Verificá los datos e intentá nuevamente.`}</p>
      <div class="actions"><button class="btn-ghost" id="restart-btn">Volver a intentar</button></div>
    </div>`));
  $("restart-btn").addEventListener("click", restart);
}

function eraseData(doc) {
  const host = $("step-result");
  host.innerHTML = "";
  host.appendChild(el(`
    <div class="empty-state erased">
      <h2>Datos eliminados</h2>
      <p>Se ejerció el derecho de supresión: los datos personales mostrados fueron borrados de esta sesión.
      En una implementación real, esta acción elimina el perfil en
      <strong>identity.identity_profiles</strong> y deja un registro mínimo y no identificante en la auditoría.</p>
      <div class="actions"><button class="btn-ghost" id="restart-btn">Nueva verificación</button></div>
    </div>`));
  $("restart-btn").addEventListener("click", restart);
}

function restart() {
  $("step-result").hidden = true;
  $("step-result").innerHTML = "";
  $("step-consent").hidden = false;
  $("form-error").hidden = true;
  $("consent").checked = false;
}

/* ---------------- mini-map ---------------- */

// Reuses the region bbox + a Rosario anchor so the domicilio reads in context.
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

  // schematic Paraná
  const river = [[-60.755,-32.580],[-60.705,-32.780],[-60.625,-32.940],[-60.520,-33.100],[-60.360,-33.215],[-60.300,-33.260]];
  ctx.strokeStyle = "rgba(80, 160, 255, 0.5)"; ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  river.forEach(([lo, la], i) => { const [x, y] = project(lo, la); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();

  // domicilio marker with glow + ping
  const [px, py] = project(lon, lat);
  const g = ctx.createRadialGradient(px, py, 0, px, py, 30);
  g.addColorStop(0, "rgba(79, 210, 255, 0.4)"); g.addColorStop(1, "rgba(79, 210, 255, 0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4fd2ff"; ctx.strokeStyle = "#0b1120"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

/* ---------------- helpers ---------------- */

function el(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}
function cell(k, v) { return `<div class="detail-cell"><div class="detail-k">${esc(k)}</div><div class="detail-v">${esc(v)}</div></div>`; }
function cellFull(k, v) { return `<div class="detail-cell full"><div class="detail-k">${esc(k)}</div><div class="detail-v">${esc(v)}</div></div>`; }

function formatDni(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

init();
