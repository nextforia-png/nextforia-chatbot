"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const {
  clientScript,
  customerAppointmentSnapshot,
  demoAppointmentSnapshot,
  markup,
  styles
} = require("./customer-appointments");

const demo = demoAppointmentSnapshot(new Date("2026-07-15T12:00:00-05:00"));
assert.strictEqual(demo.tenant_id, "demo-clinica-sonrie");
assert.strictEqual(demo.appointments.length, 11);
assert.strictEqual(demo.appointments.every(function (row) { return row.tenant_id === demo.tenant_id; }), true);
assert.strictEqual(demo.reminders.some(function (row) { return row.status === "confirmed"; }), true);
assert.strictEqual(demo.reminders.some(function (row) { return row.status === "no_response"; }), true);

const shaped = customerAppointmentSnapshot({
  tenant_id: "tenant-a",
  metrics: { booked: 1, pending: 1 },
  appointments: [
    { tenant_id: "tenant-a", conversation_id: "one", status: "booked", customer_name: "Ana Pérez", starts_at: "2030-07-21T14:00:00.000Z" },
    { tenant_id: "tenant-a", conversation_id: "two", status: "failed", customer_name: "Luis Díaz", starts_at: "2030-07-21T15:00:00.000Z" }
  ]
}, { id: "tenant-a", name: "Negocio A" });

assert.strictEqual(shaped.tenant_id, "tenant-a");
assert.strictEqual(shaped.appointments[0].ui_status, "confirmed");
assert.strictEqual(shaped.appointments[0].sync, "pending");
assert.strictEqual(shaped.appointments[1].ui_status, "needs_you");
assert.strictEqual(shaped.appointments.every(function (row) { return row.tenant_id === "tenant-a"; }), true);
new vm.Script(clientScript);
assert(clientScript.includes("Conectar Meta"));
assert(clientScript.includes("Número público de citas."));
assert(clientScript.includes("Probar llamada"));
assert(clientScript.includes("No requiere extensión."));
assert(clientScript.includes("copyAppointmentCallNumber"));
assert(clientScript.includes('["agenda","chats","reminders","rules"]'));
assert(clientScript.includes("PANEL_ONBOARDING_PATH"));
assert(clientScript.includes("appointment_setup"));
assert(clientScript.includes("Confirmar cita"));
assert(!clientScript.includes("Confirmar y enviar →"));
assert(markup.includes('id="apptRulesView"'));
assert(markup.includes("Una sola fuente de información"));
assert(markup.includes("Recuerda"));
assert(markup.includes("Confirma"));
assert(markup.includes("Llega listo"));
assert(markup.includes('id="apptNeedsCount"'));
assert(styles.includes("apptGatePhone"));
assert(styles.includes("auto-fit"));
assert(styles.includes("apptRulesGrid"));
assert(styles.includes("remJourney"));
assert(styles.includes(".apptDetail>.mobileBack{display:none!important}"));
assert(styles.includes(".apptDetail>.mobileBack{display:inline-flex!important}"));

const indexSource = fs.readFileSync(require.resolve("./index"), "utf8");
assert(indexSource.includes('const appointmentDemo = initialTab === "appointments"'));
assert(indexSource.includes('id: "nextfor-tempo-demo"'));
assert(indexSource.includes('const BOT_VERSION = "v405-customer-panel-appointment-desktop"'));

console.log("customer appointment panel tests: ok");
