"use strict";

const assert = require("assert");
const {
  customerAppointmentSnapshot,
  demoAppointmentSnapshot
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

console.log("customer appointment panel tests: ok");
