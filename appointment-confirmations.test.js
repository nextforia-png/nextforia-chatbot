"use strict";

const assert = require("assert");
const { appointmentConfirmationText, createAppointmentConfirmationService } = require("./appointment-confirmations");

(async function () {
  let current = new Date("2026-08-21T15:00:00.000Z");
  const saved = [];
  const delivered = [];
  const appointment = {
    tenant_id: "tenant-a",
    conversation_id: "appt-1",
    status: "booked",
    starts_at: "2026-08-22T15:00:00.000Z",
    customer_name: "Santiago Velásquez",
    customer_phone: "+573013507371",
    consultation_reason: "Demostración",
    channel: "whatsapp",
    created_at: "2026-08-21T14:55:00.000Z"
  };
  assert.match(appointmentConfirmationText(appointment, {
    timezone: "America/Bogota",
    business_name: "NextforIA"
  }), /Tu cita con NextforIA quedó confirmada/);

  const service = createAppointmentConfirmationService({
    now: () => current,
    loadAppointments: async () => [appointment],
    loadConfiguration: async tenantId => ({ timezone: "America/Bogota", business_name: tenantId }),
    persist: async row => { saved.push(row); appointment.confirmation_delivery = row.confirmation_delivery; },
    deliver: async (row, message) => {
      delivered.push({ tenant_id: row.tenant_id, phone: row.customer_phone, message });
      return { ok: true, provider_id: "wamid.confirmation-1", mode: "text" };
    }
  });
  const first = await service.send(appointment);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.delivery.status, "delivered");
  assert.strictEqual(delivered.length, 1);
  assert.strictEqual(delivered[0].tenant_id, "tenant-a");
  assert.strictEqual(delivered[0].phone, "+573013507371");
  assert.strictEqual(saved[0].confirmation_delivery.status, "sending");
  assert.strictEqual(saved[1].confirmation_delivery.status, "delivered");

  const duplicate = await service.send(appointment);
  assert.strictEqual(duplicate.reason, "already_delivered");
  assert.strictEqual(delivered.length, 1, "a successful confirmation must not be sent twice");

  const tenantB = Object.assign({}, appointment, {
    tenant_id: "tenant-b",
    conversation_id: "appt-2",
    customer_phone: "+573009998877",
    confirmation_delivery: undefined
  });
  const tenantBResult = await service.send(tenantB);
  assert.strictEqual(tenantBResult.ok, true);
  assert.strictEqual(delivered[1].tenant_id, "tenant-b", "delivery must preserve tenant isolation");
  assert.strictEqual(delivered[1].phone, "+573009998877");

  const tooOld = Object.assign({}, tenantB, {
    conversation_id: "appt-old",
    confirmation_delivery: undefined,
    created_at: "2026-08-10T14:55:00.000Z"
  });
  const oldResult = await service.send(tooOld, { backfill: true });
  assert.strictEqual(oldResult.reason, "outside_backfill_window");

  let failedAppointment = Object.assign({}, tenantB, { conversation_id: "appt-fail", confirmation_delivery: undefined });
  const retryService = createAppointmentConfirmationService({
    now: () => current,
    persist: async row => { failedAppointment = row; },
    deliver: async () => ({ ok: false, error: { message: "temporary_failure" } })
  });
  const failed = await retryService.send(failedAppointment);
  assert.strictEqual(failed.delivery.status, "retrying");
  assert.strictEqual(failed.delivery.attempts, 1);
  assert.match(failed.delivery.next_attempt_at, /^2026-08-21T15:02:00/);

  let recoveredAppointment = Object.assign({}, tenantB, {
    conversation_id: "appt-recover",
    confirmation_delivery: {
      status: "retrying",
      attempts: 1,
      next_attempt_at: "2026-08-21T15:30:00.000Z",
      updated_at: "2026-08-21T14:59:00.000Z"
    }
  });
  let recoveryDeliveries = 0;
  const recoveryService = createAppointmentConfirmationService({
    now: () => current,
    loadAppointments: async () => [recoveredAppointment],
    persist: async row => { recoveredAppointment = row; },
    deliver: async () => {
      recoveryDeliveries += 1;
      return { ok: true, provider_id: "wamid.recovered", mode: "text" };
    }
  });
  const recovered = await recoveryService.process();
  assert.strictEqual(recovered.delivered, 1, "startup recovery must retry a pending confirmation immediately");
  assert.strictEqual(recoveryDeliveries, 1);

  const throwingService = createAppointmentConfirmationService({
    now: () => current,
    persist: async function () {},
    deliver: async function () { throw new Error("network_down"); }
  });
  const thrown = await throwingService.send(Object.assign({}, tenantB, {
    conversation_id: "appt-throw",
    confirmation_delivery: undefined
  }));
  assert.strictEqual(thrown.delivery.status, "retrying");
  assert.strictEqual(thrown.error, "network_down");

  console.log("appointment-confirmations.test.js: ok");
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
