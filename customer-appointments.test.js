"use strict";

const assert = require("assert");
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
assert.strictEqual(demo.capabilities.manage_settings, true);
assert.strictEqual(demo.settings.rules.length, 1);
assert.strictEqual(demo.settings.reminder_policy.channel, "whatsapp");

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
assert.strictEqual(shaped.appointments[0].appointment_id, "one");
new vm.Script(clientScript);
assert(clientScript.includes("Conectar Meta"));
assert(clientScript.includes("Número público de citas."));
assert(clientScript.includes("Probar llamada"));
assert(clientScript.includes("No requiere extensión."));
assert(clientScript.includes("copyAppointmentCallNumber"));
assert(styles.includes("apptGatePhone"));
assert(styles.includes("auto-fit"));
assert(markup.includes('id="apptRulesView"'));
assert(markup.includes('id="apptMobilePanelView"'));
assert(markup.includes('id="apptMonthView"'));
assert(markup.includes('id="apptYearView"'));
assert(markup.includes('data-appt-mode="inbox"'));
assert(markup.includes('id="apptTrayRows"'));
assert(markup.includes('id="apptDetailDrawer"'));
assert(!markup.includes('id="apptChatsView"'));
assert(clientScript.includes('/admin/panel/appointment-settings'));
assert(clientScript.includes('/admin/panel/appointment-reminders/'));
assert(clientScript.includes('customer_conversation_id'));
assert(clientScript.includes('appointmentRowsInWeek'));
assert(clientScript.includes('renderAppointmentMonth'));
assert(clientScript.includes('renderAppointmentYear'));
assert(clientScript.includes('moveAppointmentPeriod'));
assert(clientScript.includes('appointmentInboxDate'));
assert(clientScript.includes('La IA agendó '));
assert(clientScript.includes('openAppointmentConversations'));
assert(clientScript.includes('reminder_policy'));

console.log("customer appointment panel tests: ok");
