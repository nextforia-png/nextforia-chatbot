"use strict";

const assert = require("assert");
const renderCustomerPanel = require("./customer-panel");

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

const redesigned = render(true, "orders");
assert(redesigned.includes('<body class="panel-redesign">'));
assert(redesigned.includes('id="nav-orders"'));
assert(redesigned.includes('<section class="view active" id="panel-orders">'));
assert(redesigned.includes("Oportunidades de venta"));
assert(redesigned.includes("4 pasos para quedar listo"));
assert(redesigned.includes("Personalizar"));

const legacy = render(false, "orders");
assert(!legacy.includes('<body class="panel-redesign">'));
assert(!legacy.includes('id="nav-orders"'));
assert(!legacy.includes('id="panel-orders"'));
assert(legacy.includes("Seguimientos comerciales"));
assert(!legacy.includes("4 pasos para quedar listo"));

const stagingDefault = renderStagingDefault();
assert(stagingDefault.includes('<body class="panel-redesign">'));
assert(stagingDefault.includes('id="nav-orders"'));

delete process.env.CUSTOMER_PANEL_REDESIGN_V1_ENABLED;
delete process.env.RENDER_SERVICE_NAME;
console.log("customer-panel-redesign.test.js OK");
