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
assert.strictEqual(demo.reminders.filter(function (row) { return row.status === "programmed"; }).length, 3);
assert.strictEqual(demo.metrics.confirmation_rate, 92);
assert.strictEqual(demo.metrics.sent_reminders, 214);

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
assert(markup.includes("En tu agenda"));
assert(markup.includes("Nadie olvida su cita — y tú no mueves un dedo."));
assert(markup.includes('id="remAttention"'));
assert(markup.includes('id="remTodayCount"'));
assert(markup.includes('id="apptNeedsCount"'));
assert(markup.includes('id="apptAgendaHero"'));
assert(markup.includes('id="apptWeekLabel"'));
assert(clientScript.includes("Conecta tu WhatsApp para que la IA confirme por ti"));
assert(clientScript.includes("shiftAppointmentWeek"));
assert(styles.includes("apptIntegrationGate"));
assert(styles.includes("apptWeekNavigator"));
assert(styles.includes("apptRulesGrid"));
assert(styles.includes("remHeroV2"));
assert(styles.includes("remCardTop"));
assert(styles.includes(".apptDetail>.mobileBack{display:none!important}"));
assert(styles.includes(".apptDetail>.mobileBack{display:inline-flex!important}"));

const indexSource = fs.readFileSync(require.resolve("./index"), "utf8");
const panelSource = fs.readFileSync(require.resolve("./customer-panel"), "utf8");
assert(indexSource.includes('const appointmentDemo = initialTab === "appointments"'));
assert(indexSource.includes('id: "nextfor-tempo-demo"'));
assert(indexSource.includes('const BOT_VERSION = "v407-customer-panel-appointment-reminders"'));
assert(panelSource.includes('id="appointmentTopActions"'));

console.log("customer appointment panel tests: ok");
