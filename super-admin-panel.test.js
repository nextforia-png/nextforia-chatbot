"use strict";

const assert = require("assert");
const renderSuperAdminPanel = require("./super-admin-panel");

let contentType = "";
let html = "";
renderSuperAdminPanel({
  setHeader: function (name, value) {
    if (String(name).toLowerCase() === "content-type") contentType = value;
  },
  send: function (body) { html = body; }
}, {
  auth: { username: "root", name: '<script>alert("x")</script>', role: "super_admin" },
  botVersion: "v-test",
  tenant: { id: "rav-toys", name: "RAV Toys", status: "active", customer_number: 1 },
  registeredClients: [{
    tenant_id: "grupo-derco",
    brand_name: "Grupo Jurídico DERCO S.A.S.",
    short_name: "DERCO",
    customer_number: 1,
    status: "pilot",
    industry: "professional_services"
  }],
  commercialReadiness: {
    version: "test",
    stages: [
      { label: "Calificación comercial", owner: "NexforIA", status: "ready" },
      { label: "Meta WhatsApp", owner: "Meta", status: "waiting_meta" }
    ],
    requiredTenantFields: ["tenant_id", "shopify_admin_token"]
  },
  accessModel: {
    version: "test",
    roles: [{ role: "super_admin", level: 4, owner: "NexforIA", scope: "platform", purpose: "Opera plataforma." }],
    future_panels: [{ id: "platform_super_admin", label: "Super admin", owner: "NexforIA", roles: ["super_admin"], purpose: "Opera plataforma." }]
  }
});

assert.match(contentType, /text\/html/);
assert.match(html, /Panel Super Admin/);
assert.match(html, /data-view="overview"/);
assert.match(html, /data-view="clients"/);
assert.match(html, /data-view="leads"/);
assert.match(html, /data-view="incidents"/);
assert.match(html, /data-view="billing"/);
assert.match(html, /Grupo Jurídico DERCO/);
assert.match(html, /\/admin\/pilots\/derco/);
assert.match(html, /Cliente #1 · Grupo Jurídico DERCO/);
assert.match(html, /rav-toys · entorno legado/);
assert.doesNotMatch(html, /Cliente #1 · RAV Toys/);
assert.match(html, /Crear acceso RAV/);
assert.match(html, /role="dialog" aria-modal="true"/);
assert.match(html, /Meta App Review pendiente/);
assert.match(html, /No se muestran datos de ejemplo como si fueran producción/);
assert.doesNotMatch(html, /<script>alert\("x"\)<\/script>/);
assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);

console.log("super-admin-panel.test.js: ok");
