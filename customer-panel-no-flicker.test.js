// El panel no debe "rebotar" al entrar. El primer pintado del servidor
// tiene que coincidir con el estado que showTab(INITIAL_TAB) dejaría:
// mismo título, mismo subtítulo, mismo módulo activo y misma toolbar.
// Si el servidor pinta "Resumen / Atención" y el JS lo cambia a "Citas",
// el cliente de Agendamiento ve el salto. Eso es lo que aquí se previene.
const assert = require("node:assert");
const renderCustomerPanel = require("./customer-panel");

function renderPanel(tenantContext, initialTab) {
  let html = "";
  const res = {
    setHeader() {}, type() { return res; }, status() { return res; },
    send(v) { html = v; }, end(v) { if (v) html = v; }
  };
  renderCustomerPanel(res, { auth: { name: "QA", role: "admin" }, capabilities: {}, tenantContext, initialTab });
  return html;
}
function pick(html, re) { const m = re.exec(html); return m ? m[1].trim() : null; }
function activeView(html) { const m = html.match(/class="view active" id="(panel-[a-z]+)"/); return m ? m[1] : null; }

// ── Tenant release chatbot-only: arranca en Resumen, sin Agendamiento ──
const chatbotOnly = renderPanel({ id: "b", company_name: "Empresa B", plan_id: "nextfor-uno", assigned_bot_id: "atencion-cliente" });
assert.strictEqual(pick(chatbotOnly, /id="pageTitle">([^<]*)</), "Resumen", "un tenant de Atención debe pintar Resumen de una vez");
assert.strictEqual(activeView(chatbotOnly), "panel-summary", "la sección de resumen ya viene activa desde el servidor");
assert.ok(!chatbotOnly.includes('id="bot-appointments"'), "la release inicial no muestra bot de Agendamiento");
assert.ok(!chatbotOnly.includes('id="panel-appointments"'), "la release inicial no renderiza el panel de Agendamiento");

// ── Tenant de Atención: arranca en Resumen ──
const atencion = renderPanel({ id: "a", company_name: "Empresa A", plan_id: "nextfor-aura", assigned_bot_id: "atencion-cliente" });
assert.strictEqual(pick(atencion, /id="pageTitle">([^<]*)</), "Resumen");
assert.strictEqual(pick(atencion, /id="pageSubtitle">([^<]*)</), "Lo que tu Nextfor hizo por ti · últimos 7 días");
assert.strictEqual(activeView(atencion), "panel-summary");
assert.ok(!/<div class="toolbar" style="display:none">/.test(atencion), "en Resumen la toolbar sí se muestra");

// ── Siempre hay exactamente un módulo activo en el HTML inicial ──
[chatbotOnly, atencion, renderPanel(null)].forEach(function (html) {
  const count = (html.match(/class="view active"/g) || []).length;
  assert.strictEqual(count, 1, "debe haber exactamente una vista activa en el primer pintado");
});

// ── El servidor respeta el tab pedido cuando es válido para el tenant ──
const planTab = renderPanel({ id: "a", company_name: "Empresa A", plan_id: "nextfor-aura", assigned_bot_id: "atencion-cliente" }, "plan");
assert.strictEqual(pick(planTab, /id="pageTitle">([^<]*)</), "Mi plan");
assert.strictEqual(activeView(planTab), "panel-plan");
assert.ok(/<div class="toolbar" style="display:none">/.test(planTab), "en Mi plan la toolbar no aplica");

// ── Un tenant de Atención que pide 'appointments' cae a Resumen, no a un módulo que no tiene ──
const forced = renderPanel({ id: "a", company_name: "Empresa A", plan_id: "nextfor-aura", assigned_bot_id: "atencion-cliente" }, "appointments");
assert.strictEqual(activeView(forced), "panel-summary", "no se activa un módulo no asignado ni pidiéndolo por URL");

console.log("customer-panel-no-flicker.test.js OK");
