"use strict";

const assert = require("assert");
const renderCustomerPanel = require("./customer-panel");

function render(options) {
  let status = 0;
  let contentType = "";
  let html = "";
  const res = {
    status: function (value) { status = value; return this; },
    setHeader: function (name, value) { if (name.toLowerCase() === "content-type") contentType = value; return this; },
    send: function (value) { html = String(value); return this; }
  };
  renderCustomerPanel(res, Object.assign({ auth: { name: "Admin", role: "admin" }, capabilities: {}, initialTab: "summary", botVersion: "v-test-panel" }, options || {}));
  assert.strictEqual(status, 200);
  assert(contentType.includes("text/html"));
  return html;
}

const legacy = render();
assert(legacy.includes("<title>Nextfor IA · RAV Toys</title>"));
assert(legacy.includes('<h1><span id="brandBusinessName">RAV Toys</span></h1><p>con <span>Nextfor IA</span></p>'));
assert(legacy.includes('<h1><span id="mobileBrandBusinessName">RAV Toys</span></h1><p>con <span>Nextfor IA</span></p>'));
assert(legacy.includes('id="bot-support"'));
assert(legacy.includes('id="bot-appointments"'));
assert(legacy.includes("2 bots activos"));
assert(legacy.includes("Atención al cliente · Plan Growth"));

const tenantA = render({
  tenantContext: { id: "tenant-a", company_name: "Empresa A", plan_id: "nextfor-aura", assigned_bot_id: "atencion-cliente", status: "live" }
});
assert(tenantA.includes("<title>Nextfor IA · Empresa A</title>"));
assert(tenantA.includes('<h1><span id="brandBusinessName">Empresa A</span></h1><p>con <span>Nextfor IA</span></p>'));
assert(tenantA.includes('id="bot-support"'));
assert(!tenantA.includes('id="bot-appointments"'));
assert(!tenantA.includes('id="navAppointments"'));
assert(!tenantA.includes('id="panel-appointments"'));
assert(tenantA.includes("1 bot activo"));
assert(tenantA.includes("Atención al cliente · Plan Nextfor Aura"));
assert(tenantA.includes("Versión v-test-panel"));
assert(tenantA.includes("Configuración de tu bot"));
assert(tenantA.includes("Ver cuestionario completo"));
assert(tenantA.includes('item.last_delivery_status==="failed"'));
assert(tenantA.includes("Meta rechazó el envío"));
assert(tenantA.includes('m.delivery_status==="failed"'));
assert(tenantA.includes("No enviado"));
assert(tenantA.includes('id="customerProfileName"'), "el perfil debe permitir guardar el nombre del cliente");
assert(tenantA.includes('id="mobileCustomerProfileName"'), "el chat móvil debe permitir guardar el nombre del cliente");
assert(tenantA.includes('id="nameSuggestion"'), "el perfil debe mostrar la sugerencia de Nextfor");
assert(tenantA.includes('id="mobileNameSuggestion"'), "el chat móvil debe mostrar la sugerencia de Nextfor");
assert(tenantA.includes("Nextfor sugiere"));
assert(tenantA.includes("Guardar perfil"));
assert(tenantA.includes("name:customerNameValue()"), "el nombre confirmado debe enviarse al endpoint de metadata");
assert(!tenantA.includes(">Empresa B<"));
assert(!tenantA.includes(">RAV Toys<"));

const tenantB = render({
  tenantContext: { id: "tenant-b", company_name: "Empresa B", plan_id: "nextfor-uno", assigned_bot_id: "atencion-cliente", status: "live" }
});
assert(tenantB.includes("<title>Nextfor IA · Empresa B</title>"));
assert(tenantB.includes('<h1><span id="brandBusinessName">Empresa B</span></h1><p>con <span>Nextfor IA</span></p>'));
assert(tenantB.includes('id="bot-support"'));
assert(!tenantB.includes('id="bot-appointments"'));
assert(!tenantB.includes('id="navAppointments"'));
assert(!tenantB.includes('id="panel-appointments"'));
assert(tenantB.includes("Atención al cliente · Plan Nextfor Uno"));
assert(tenantB.includes('INITIAL_TAB="summary"'));
assert(!tenantB.includes(">Empresa A<"));
assert(!tenantB.includes(">RAV Toys<"));

const staleCombinedBot = render({
  tenantContext: { id: "tenant-c", company_name: "Empresa C", plan_id: "nextfor-aura", assigned_bot_id: "both", status: "live" }
});
assert(staleCombinedBot.includes("Atención al cliente · Plan Nextfor Aura"));
assert(staleCombinedBot.includes("1 bot activo"));
assert(!staleCombinedBot.includes('id="bot-appointments"'));
assert(!staleCombinedBot.includes('id="mobile-bot-appointments"'));
assert(!staleCombinedBot.includes('id="mnav-appointments"'));
assert(!staleCombinedBot.includes('id="mnav-appointment-chats"'));
assert(!staleCombinedBot.includes('id="navAppointments"'));
assert(!staleCombinedBot.includes('id="panel-appointments"'));
assert(staleCombinedBot.includes('INITIAL_TAB="summary"'));

const escaped = render({
  tenantContext: { id: "unsafe", company_name: "<script>alert(1)</script>", plan_id: "nextfor-aura", assigned_bot_id: "atencion-cliente" }
});
assert(!escaped.includes("<script>alert(1)</script>"));
assert(escaped.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));

console.log("customer-panel-tenant-context.test.js: ok");
