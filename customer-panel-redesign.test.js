"use strict";

const assert = require("assert");
const renderCustomerPanel = require("./customer-panel");
const botConfiguration = require("./customer-bot-configuration");

function render(flag, initialTab) {
  process.env.CUSTOMER_PANEL_REDESIGN_V1_ENABLED = flag ? "true" : "0";
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

function renderTenant(planId, initialTab, ordersV1Enabled) {
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
    ordersV1Enabled: ordersV1Enabled !== false,
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
assert(redesigned.includes("Canal futuro · no realiza llamadas todavía"));
assert(redesigned.includes("PANEL_REDESIGN_ENABLED?channelGlyph(channel)"));
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
assert(redesigned.includes('id="mnav-mobile-home"'));
assert(redesigned.includes('id="mnav-mobile-chats"'));
assert(redesigned.includes('id="mnav-mobile-profile"'));
assert(redesigned.includes('style="--mobile-tabs:3"'));
assert(redesigned.includes('class="mobileProfileLinks"'));
assert(redesigned.includes('onclick="openSummaryMetric(\'sales\')"'));
assert(redesigned.includes('onclick="openSummaryMetric(\'all\')"'));
assert(redesigned.includes('onclick="openSummaryMetric(\'resolved\')"'));
assert(redesigned.includes('onclick="openSummaryMetric(\'closings\')"'));
assert(redesigned.includes('function setConversationFilter(filter){state.filter=["all","you","resolved","sales","closings"]'));
assert(redesigned.includes('function isSalesAssistedConversation(item)'));
assert(redesigned.includes('function isPendingSalesClosing(item)'));
assert(redesigned.includes('class="activityValue"'));
assert(redesigned.includes('.activityValue{position:absolute'));
assert(redesigned.includes('renderActivity(s.clients_by_day||[],state.data.activity_window||{})'));
assert(!redesigned.includes('[34,43,58,37,74,88,61]'), "summary must never invent chart values");
assert(!redesigned.includes('+18% vs. período anterior'), "summary must not invent a period comparison");
assert(redesigned.includes('Conversation density repair'));
assert(redesigned.includes('.panel-redesign.conversations-view .thread{height:auto!important;min-height:62px!important'));
assert(redesigned.includes('body.conversations-view:not(.chat-open) .thread{height:100%'), "the regression fixture must keep proving the production empty-selection rule exists");
assert(redesigned.includes('conversationChannel:"all"'));
assert(redesigned.includes('function setConversationChannel(channel)'));
assert(redesigned.includes('data-conversation-channel="'));
assert(redesigned.includes('aria-label="Quién responde esta conversación"'));
assert(redesigned.includes('id="handoffAiBtn"'));
assert(redesigned.includes('id="handoffHumanBtn"'));
assert(redesigned.includes('onkeydown="conversationComposerKeydown(event)"'));
assert(redesigned.includes('class="threadGroupTitle"'));
assert(redesigned.includes('channel-call'));
assert(redesigned.includes('body.panel-redesign.conversations-view .listColumn'));
assert(redesigned.includes('body.panel-redesign.conversations-view #panel-inbox{height:100%;min-height:0;overflow:hidden}'));
assert(redesigned.includes('body.panel-redesign.conversations-view .threads,'));
assert(redesigned.includes('flex:1 1 0;min-height:0;max-height:none;overflow-y:auto!important;overscroll-behavior:contain;scrollbar-gutter:stable'));
assert(redesigned.includes('grid-template-rows:auto minmax(220px,1fr) auto'));
assert(redesigned.includes('grid-template-columns:384px minmax(0,1fr)!important'));
assert(!redesigned.includes('grid-template-columns:384px minmax(0,1fr) 300px!important'));
assert(redesigned.includes('body.panel-redesign.conversations-view .guidedAction{display:none!important}'));
assert(redesigned.includes('body.panel-redesign.conversations-view.profile-open .profileColumn'));
assert(redesigned.includes('function toggleConversationProfile(force)'));
assert(redesigned.includes('aria-label="Ver información del cliente"'));
assert(redesigned.includes('class="profileDrawerClose"'));
assert(redesigned.includes('body.panel-redesign.conversations-view .guidedAction>p{display:none}'));
assert(redesigned.includes('body.panel-redesign.conversations-view.chat-open .chatColumn{display:grid!important;grid-template-rows:auto minmax(230px,1fr) auto'));
assert(redesigned.includes('body.panel-redesign.conversations-view.chat-open .conversationAction{max-height:46dvh'));
assert(redesigned.includes('body.panel-redesign.conversations-view.chat-open .mobileCustomerNameCard{display:none}'));
const responseCard = redesigned.match(/<article class="card metric"><div class="metricTop"><span class="metricLabel">Tiempo de[\s\S]*?<\/article>/);
assert(responseCard, "response time card must render");
assert(!responseCard[0].includes("openSummaryMetric"), "response time must remain informational");
const aiSummaryCard = redesigned.match(/<section class="card darkInsight">[\s\S]*?<\/section>/);
assert(aiSummaryCard, "AI summary card must render");
assert(!aiSummaryCard[0].includes("openSummaryMetric"), "AI summary must remain informational");
assert(redesigned.includes("openProfileSection('plan')"));
assert(redesigned.includes("openProfileSection('channels')"));
assert(redesigned.includes("openProfileSection('setup')"));
assert(redesigned.includes("openProfileSection('notifications')"));
assert(!redesigned.includes("undefinedNotificaciones"));
assert(!redesigned.includes('id="usagePct"'), "the approved plan redesign must not show chat consumption");
assert(!redesigned.includes("Paquetes de rescate"), "unpublished rescue packages must not be shown as a product");
assert(!redesigned.includes("Programa de referidos"), "an unimplemented referral program must not be presented as active");

const redesignedMarkup = redesigned.split("<script>")[0];
for (const match of redesignedMarkup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
  const attrs = match[1];
  const label = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert(
    /onclick=|disabled|type="submit"/.test(attrs),
    "enabled redesign button must have an action: " + label
  );
}

assert(botConfiguration.clientScript.includes('loadBotPersonality'));
assert(botConfiguration.clientScript.includes('saveBotConfiguration'));

const legacy = render(false, "orders");
assert(!legacy.includes('<body class="panel-redesign">'));
assert(!legacy.includes('id="nav-orders"'));
assert(!legacy.includes('id="panel-orders"'));
assert(legacy.includes("Seguimientos comerciales"));
assert(!legacy.includes("4 pasos para quedar listo"));
assert(!legacy.includes('id="panelActionToast"'));
assert(!legacy.includes('id="handoffAiBtn"'));
assert(!legacy.includes('onkeydown="conversationComposerKeydown(event)"'));
assert(!legacy.split("<script>")[0].includes('data-conversation-channel="'));
assert(legacy.includes('<button class="ghostBtn" type="button">Mantener plan actual</button>'));
assert(legacy.includes('>Comprar chats adicionales</button>'));
assert(legacy.includes('>Ver promoción</button>'));

const stagingDefault = renderStagingDefault();
assert(stagingDefault.includes('<body class="panel-redesign">'));
assert(stagingDefault.includes('id="nav-orders"'));
const redesignedPlan = render(true, "plan");
assert(redesignedPlan.includes('<body class="panel-redesign">'), "Mi plan must retain its redesign styles");
const redesignedChannels = render(true, "channels");
assert(redesignedChannels.includes('<body class="panel-redesign">'), "Conectar canales must retain its redesign styles");
assert(redesigned.includes('["summary","conversations","orders","retargeting","plan","channels"].includes(name)'));

// Production carried the old review-era literal `false`.  A successful code
// deploy must still serve the approved v2 panel; only `0` is the rollback.
process.env.CUSTOMER_PANEL_REDESIGN_V1_ENABLED = "false";
const migratedProductionFlag = renderTenant("nextfor-aura", "summary", true);
assert(migratedProductionFlag.includes('<body class="panel-redesign">'));
assert(migratedProductionFlag.includes('id="nav-orders"'));
assert(migratedProductionFlag.includes("Oportunidades de venta"));

const uno = renderTenant("nextfor-uno");
assert(uno.includes("Nextfor Uno"));
assert(uno.includes("/admin/assets/lumen-plan-uno.png"));
assert(uno.includes("1 bot entrenado y listo"));
assert(uno.includes('id="nav-orders"'));
assert(uno.includes('id="panel-orders"'));
assert(!uno.includes('id="nav-appointments"'));

const aura = renderTenant("nextfor-aura");
assert(aura.includes("Nextfor Aura"));
assert(aura.includes("1 bot entrenado y listo"));
assert(aura.includes('id="nav-orders"'));
assert(aura.includes('id="panel-orders"'));
assert(!aura.includes('id="nav-appointments"'));

const tempo = renderTenant("nextfor-tempo", "summary");
assert(tempo.includes("Nextfor Tempo"));
assert(tempo.includes('id="nav-appointments"'));
assert(tempo.includes('<section class="view active" id="panel-appointments">'));
assert(!tempo.includes('id="nav-orders"'));
assert(!tempo.includes('<body class="panel-redesign">'), "appointment-only tenants keep the production appointment shell");

const atlas = renderTenant("nextfor-atlas");
assert(atlas.includes("Nextfor Atlas"));
assert(atlas.includes("/admin/assets/lumen-plan-atlas.png"));
assert(atlas.includes("2 bots entrenados y listos"));
assert(atlas.includes('id="nav-appointments"'));
assert(atlas.includes('id="nav-orders"'));
const atlasSupportLabel = atlas.match(/id="bot-support"[\s\S]*?<strong>([^<]+)<\/strong>/);
const atlasAppointmentLabel = atlas.match(/id="bot-appointments"[\s\S]*?<strong>([^<]+)<\/strong>/);
assert.strictEqual(atlasSupportLabel && atlasSupportLabel[1], "Atención al cliente");
assert.strictEqual(atlasAppointmentLabel && atlasAppointmentLabel[1], "Agendamiento");

const auraOrdersOff = renderTenant("nextfor-aura", "orders", false);
assert(!auraOrdersOff.includes('id="nav-orders"'));
assert(!auraOrdersOff.includes('id="panel-orders"'));
assert(redesigned.includes('.ordersView,.panel-redesign .ordersToolbar,.panel-redesign .ordersShell,.panel-redesign .orderListPane,.panel-redesign .orderDetailPane{width:100%;max-width:100%;min-width:0}'));
assert(redesigned.includes('Orders layout repair'), 'orders visual repair styles must remain present');
assert(redesigned.includes('.orderShippingGrid button{width:100%!important;height:auto!important;min-height:70px'), 'shipping fields must grow instead of clipping values');
assert(redesigned.includes('.orderDetailPane{min-width:0;padding:25px 28px 44px'), 'order detail must keep its independent non-overflowing scroller');
assert(redesigned.includes('.orderDetailActions{display:grid;grid-template-columns:1fr'), 'order actions must stack without overlapping');

delete process.env.CUSTOMER_PANEL_REDESIGN_V1_ENABLED;
delete process.env.RENDER_SERVICE_NAME;
console.log("customer-panel-redesign.test.js OK");
