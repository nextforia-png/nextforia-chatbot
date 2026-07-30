"use strict";

const assert = require("node:assert");
const renderCustomerPanel = require("./customer-panel");

let html = "";
const res = {
  status() { return this; },
  setHeader() { return this; },
  type() { return this; },
  send(value) { html = String(value); return this; }
};

renderCustomerPanel(res, {
  auth: { name: "QA", role: "admin" },
  capabilities: {},
  tenantContext: {
    id: "tenant-external-tabs",
    company_name: "Empresa QA",
    plan_id: "nextfor-aura",
    assigned_bot_id: "atencion-cliente"
  },
  channelConnectionsV1Enabled: true
});

assert.match(html, /function prepareExternalIntegrationTab\(label\)/);
assert.match(html, /window\.open\("about:blank","_blank"\)/);
assert.match(html, /function navigateExternalIntegrationTab\(tab,url\)/);
assert.match(html, /state\.externalIntegrationPending=true/);
assert.match(html, /window\.addEventListener\("focus"/);
assert.match(html, /Meta se abrió en una pestaña nueva/);
assert.match(html, /Google Calendar se abrió en una pestaña nueva/);
assert.match(html, /Shopify se abrió en una pestaña nueva/);
assert.match(html, /onclick="openShopifyConnection\(\)"/);
assert.doesNotMatch(html, /location\.assign\(body\.authorization_url\)/);
assert.doesNotMatch(html, /location\.href="\/admin\/integrations\/shopify\/connect"/);
assert.doesNotMatch(html, /href="\/admin\/integrations\/shopify\/connect">Conectar Shopify/);
assert.doesNotMatch(html, /location\.href=body\.checkout\.checkout_url/);

console.log("customer-panel-external-navigation.test.js OK");
