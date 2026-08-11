"use strict";

const assert = require("assert");
const renderCustomerPanel = require("./customer-panel");
const botConfiguration = require("./customer-bot-configuration");

function render(flag, initialTab) {
  process.env.CUSTOMER_PANEL_REDESIGN_V1_ENABLED = flag ? "true" : "false";
  let html = "";
  const res = {
    status: function (code) { assert.strictEqual(code, 200); return this; },
    setHeader: function () { return this; },
    send: function (value) { html = String(value); return this; }
  };
  renderCustomerPanel(res, {
    auth: { name: "QA", role: "admin" },
    capabilities: {},
    initialTab: initialTab || "summary",
    demoMode: true,
    channelConnectionsV1Enabled: true,
    botVersion: "v-redesign-test"
  });
  return html;
}

function renderStagingDefault() {
  delete process.env.CUSTOMER_PANEL_REDESIGN_V1_ENABLED;
  process.env.RENDER_SERVICE_NAME = "nextforia-chatbot-staging";
  const html = renderCustomerPanelToString("summary");
  delete process.env.RENDER_SERVICE_NAME;
  return html;
}

function renderCustomerPanelToString(initialTab) {
  let html = "";
  const res = {
    status: function (code) { assert.strictEqual(code, 200); return this; },
    setHeader: function () { return this; },
    send: function (value) { html = String(value); return this; }
  };
  renderCustomerPanel(res, {
    auth: { name: "QA", role: "admin" },
    capabilities: {},
    initialTab: initialTab || "summary",
    demoMode: true,
    channelConnectionsV1Enabled: true,
    botVersion: "v-redesign-test"
  });
  return html;
}

function renderTenant(planId, initialTab) {
  process.env.CUSTOMER_PANEL_REDESIGN_V1_ENABLED = "true";
  let html = "";
  const res = {
    status: function (code) { assert.strictEqual(code, 200); return this; },
    setHeader: function () { return this; },
    send: function (value) { html = String(value); return this; }
  };
  renderCustomerPanel(res, {
    auth: { name: "Tenant QA", role: "admin" },
    capabilities: {},
    initialTab: initialTab || "plan",
    demoMode: false,
    channelConnectionsV1Enabled: true,
    botVersion: "v-redesign-test",
    tenantContext: {
      id: "tenant-" + planId,
      company_name: "Empresa " + planId,
      plan_id: planId,
      assigned_bot_id: ""
    }
  });
  return html;
}

const redesigned = render(true, "orders");
assert(redesigned.includes('<body class="panel-redesign">'));
assert(redesigned.includes('id="nav-orders"'));
assert(redesigned.includes('<section class="view active" id="panel-orders">'));
assert(redesigned.includes("Oportunidades de venta"));
assert(redesigned.includes("4 pasos para quedar listo"));
assert(redesigned.includes("Personalizar"));
for (const filter of ["all", "por_confirmar", "pagado", "preparacion", "enviado", "cancelado"]) {
  assert(
    redesigned.includes('data-order-filter="' + filter + '" onclick="setOrderFilter(this)"'),
    "approved orders filter must render: " + filter
  );
}
assert(redesigned.includes('onclick="dismissPlanRecommendation(this)"'));
assert(redesigned.includes('id="panelActionToast"'));
assert(redesigned.includes('if(DEMO_MODE&&PANEL_REDESIGN_ENABLED){fillAccountProfile(demoAccountProfile())'));
assert(redesigned.includes('if(DEMO_MODE&&PANEL_REDESIGN_ENABLED){panelToast("Esta es una demo pública'));
assert(redesigned.includes('onclick="requestPlanSupport(this.dataset.planId,this.dataset.planName)"'));
assert(redesigned.includes('disabled title="Disponible cuando el backend publique métricas de hoy"'));

const redesignedMarkup = redesigned.split("<script>")[0];
for (const match of redesignedMarkup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
  const attrs = match[1];
  const label = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert(
    /onclick=|disabled|type="submit"/.test(attrs),
    "enabled redesign button must have an action: " + label
  );
}

assert(botConfiguration.clientScript.includes('DEMO_MODE&&PANEL_REDESIGN_ENABLED'));
assert(botConfiguration.clientScript.includes('nx_demo_personality_v1'));
assert(botConfiguration.clientScript.includes('Todo guardado en la demo'));

const legacy = render(false, "orders");
assert(!legacy.includes('<body class="panel-redesign">'));
assert(!legacy.includes('id="nav-orders"'));
assert(!legacy.includes('id="panel-orders"'));
assert(legacy.includes("Seguimientos comerciales"));
assert(!legacy.includes("4 pasos para quedar listo"));
assert(!legacy.includes('id="panelActionToast"'));
assert(legacy.includes('<button class="ghostBtn" type="button">Mantener plan actual</button>'));
assert(legacy.includes('>Comprar chats adicionales</button>'));
assert(legacy.includes('>Ver promoción</button>'));

const stagingDefault = renderStagingDefault();
assert(stagingDefault.includes('<body class="panel-redesign">'));
assert(stagingDefault.includes('id="nav-orders"'));

const uno = renderTenant("nextfor-uno");
assert(uno.includes("Nextfor Uno"));
assert(uno.includes("/admin/assets/lumen-plan-uno.png"));
assert(uno.includes("1 bot entrenado y listo"));
assert(!uno.includes('id="nav-orders"'));
assert(!uno.includes('id="panel-orders"'));
assert(!uno.includes('id="nav-appointments"'));

const tempo = renderTenant("nextfor-tempo", "summary");
assert(tempo.includes("Nextfor Tempo"));
assert(tempo.includes("/admin/assets/lumen-plan-tempo.png"));
assert(tempo.includes("1 bot entrenado y listo"));
assert(tempo.includes('id="nav-appointments"'));
assert(tempo.includes('<section class="view active" id="panel-appointments">'));
assert(!tempo.includes('id="nav-orders"'));

const atlas = renderTenant("nextfor-atlas");
assert(atlas.includes("Nextfor Atlas"));
assert(atlas.includes("/admin/assets/lumen-plan-atlas.png"));
assert(atlas.includes("2 bots entrenados y listos"));
assert(atlas.includes('id="nav-appointments"'));
assert(!atlas.includes('id="nav-orders"'));

delete process.env.CUSTOMER_PANEL_REDESIGN_V1_ENABLED;
delete process.env.RENDER_SERVICE_NAME;
console.log("customer-panel-redesign.test.js OK");
