"use strict";

const assert = require("assert");
const {
  AppointmentRegistry,
  appointmentFromElevenLabsEvent,
  appointmentCustomerPhone,
  cleanReminderState,
  normalizeAppointment,
  normalizeReminderDeliveries
} = require("./appointments");
const { DERCO_TENANT_ID, getRegisteredClient, listRegisteredClients, parseAgentTenantMap } = require("./client-registry");

function sampleEvent(overrides) {
  const event = {
    type: "post_call_transcription",
    event_timestamp: 1784390400,
    data: {
      agent_id: "agent_derco",
      conversation_id: "conv_001",
      metadata: { channel: "whatsapp" },
      analysis: {
        transcript_summary: "El cliente solicitó y confirmó una cita.",
        data_collection_results: {
          appointment_status: { value: "booked" },
          appointment_datetime: { value: "2026-07-21T09:00:00-05:00" },
          client_name: { value: "María Pérez" },
          client_phone: { value: "+573001234567" },
          client_email: { value: "MARIA@example.com" },
          consultation_reason: { value: "Consulta laboral" },
          data_processing_consent: { value: "authorized" }
        }
      }
    }
  };
  return Object.assign(event, overrides || {});
}

(async function run() {
  assert.equal(
    appointmentCustomerPhone("whatsapp", "wa:573013507371", "+573000000000"),
    "+573013507371",
    "WhatsApp bookings must use the real channel identity instead of a model-supplied placeholder"
  );
  assert.equal(appointmentCustomerPhone("voice", "voice:caller", "+573009998888"), "+573009998888");

  assert.equal(listRegisteredClients().length, 1);
  assert.equal(getRegisteredClient(DERCO_TENANT_ID).customer_number, 1);
  assert.equal(getRegisteredClient(DERCO_TENANT_ID).brand_name, "Grupo Jurídico DERCO S.A.S.");

  const agentMap = parseAgentTenantMap({
    ELEVENLABS_AGENT_TENANT_MAP: JSON.stringify({ agent_derco: DERCO_TENANT_ID, agent_unknown: "not-registered" })
  });
  assert.equal(agentMap.agent_derco, DERCO_TENANT_ID);
  assert.equal(agentMap.agent_unknown, "not-registered");

  const parsed = appointmentFromElevenLabsEvent(sampleEvent(), DERCO_TENANT_ID);
  assert.equal(parsed.status, "booked");
  assert.equal(parsed.appointment_id, "conv_001", "legacy ElevenLabs events keep a stable appointment id");
  assert.equal(parsed.conversation_id, "conv_001");
  assert.equal(parsed.customer_name, "María Pérez");
  assert.equal(parsed.customer_email, "maria@example.com");
  assert.equal(parsed.starts_at, "2026-07-21T14:00:00.000Z");
  assert.equal(parsed.duration_minutes, 60);
  assert.equal(parsed.data_processing_consent, "authorized");
  const withRequirements = normalizeAppointment(Object.assign({}, parsed, {
    booking_fields: { id: "10203040", primera_cita: "Sí", "campo inválido": "se normaliza" },
    booking_requirements_version: 2,
    appointment_outcome: "no_show",
    appointment_outcome_at: "2026-07-21T15:30:00.000Z",
    appointment_outcome_by: "admin@tenant-a.test"
  }));
  assert.strictEqual(withRequirements.booking_fields.primera_cita, "Sí");
  assert.strictEqual(withRequirements.booking_fields.campoinvlido, "se normaliza");
  assert.strictEqual(withRequirements.booking_requirements_version, 2);
  assert.strictEqual(withRequirements.appointment_outcome, "no_show");
  assert.strictEqual(withRequirements.appointment_outcome_at, "2026-07-21T15:30:00.000Z");
  assert.strictEqual(withRequirements.appointment_outcome_by, "admin@tenant-a.test");
  const depositAppointment = normalizeAppointment({
    tenant_id: DERCO_TENANT_ID,
    appointment_id: "deposit_001",
    status: "requested",
    deposit: { status: "pending", amount: 60000, currency: "USD", rule_label: "Monto fijo", blocks_confirmation: true, method: "cash" }
  });
  assert.deepEqual(depositAppointment.deposit, {
    status: "pending", amount: 60000, currency: "COP", rule_label: "Monto fijo", blocks_confirmation: true, method: null
  }, "pending deposits cannot contain a payment method");
  const legacyVerifiedDeposit = normalizeAppointment({
    tenant_id: DERCO_TENANT_ID,
    appointment_id: "deposit_legacy",
    status: "booked",
    deposit_status: "verified"
  });
  assert.equal(legacyVerifiedDeposit.deposit.status, "received", "legacy verified state maps safely to human-received state");

  const persisted = [];
  const registry = new AppointmentRegistry({ onUpsert: async row => persisted.push(row) });
  await registry.ingestElevenLabs(sampleEvent(), DERCO_TENANT_ID);
  await registry.ingestElevenLabs(sampleEvent(), DERCO_TENANT_ID);
  assert.equal(registry.list(DERCO_TENANT_ID).length, 1, "retries must be idempotent");
  assert.equal(persisted.length, 2, "each delivery may safely upsert persistence");

  const sharedConversationRegistry = new AppointmentRegistry();
  await sharedConversationRegistry.upsert({
    tenant_id: DERCO_TENANT_ID,
    appointment_id: "apt_shared_001",
    conversation_id: "legacy_apt_001",
    customer_conversation_id: "whatsapp:573001112233",
    status: "booked",
    starts_at: "2026-07-21T14:00:00Z"
  }, false);
  await sharedConversationRegistry.upsert({
    tenant_id: DERCO_TENANT_ID,
    appointment_id: "apt_shared_002",
    conversation_id: "legacy_apt_002",
    customer_conversation_id: "whatsapp:573001112233",
    status: "requested",
    starts_at: "2026-07-28T14:00:00Z"
  }, false);
  assert.equal(sharedConversationRegistry.list(DERCO_TENANT_ID).length, 2, "one customer conversation may own multiple appointments");
  assert.equal(sharedConversationRegistry.get(DERCO_TENANT_ID, "apt_shared_001").customer_conversation_id, "whatsapp:573001112233");
  assert.equal(sharedConversationRegistry.get("another-tenant", "apt_shared_001"), null, "appointment lookup must be tenant scoped");
  const sharedConversationUpdate = await sharedConversationRegistry.applyPanelAction(
    DERCO_TENANT_ID,
    "apt_shared_002",
    "confirm",
    { actor: "Admin DERCO", persist: false }
  );
  assert.equal(sharedConversationUpdate.appointment_id, "apt_shared_002");
  assert.equal(sharedConversationUpdate.status, "booked");
  assert.equal(sharedConversationRegistry.get(DERCO_TENANT_ID, "apt_shared_001").status, "booked", "actions must not mutate a sibling appointment in the same conversation");

  const legacy = normalizeAppointment({
    tenant_id: DERCO_TENANT_ID,
    conversation_id: "legacy_only_001",
    status: "requested"
  });
  assert.equal(legacy.appointment_id, "legacy_only_001", "legacy conversation ids remain valid appointment ids");
  assert.equal(legacy.conversation_id, "legacy_only_001");

  assert.equal(cleanReminderState("scheduled"), "programmed");
  assert.equal(cleanReminderState({ delivery_status: "blocked-template" }), "blocked");
  assert.equal(cleanReminderState("unexpected-provider-state"), "not_scheduled");
  const deliveries = normalizeReminderDeliveries([{
    reminder_id: "rem_001",
    channel: "WhatsApp",
    delivery_status: "delivered",
    attempts: "2",
    scheduled_at: "2026-07-21T09:00:00-05:00",
    delivered_at: "2026-07-21T14:01:00Z",
    provider_message_id: "wamid.001"
  }, {
    id: "rem_002",
    state: "retrying",
    attempt: -4,
    error: "provider timeout"
  }]);
  assert.deepEqual(deliveries[0], {
    id: "rem_001",
    channel: "whatsapp",
    status: "delivered",
    attempt: 2,
    scheduled_for: "2026-07-21T14:00:00.000Z",
    delivered_at: "2026-07-21T14:01:00.000Z",
    provider_message_id: "wamid.001"
  });
  assert.equal(deliveries[1].status, "retrying");
  assert.equal(deliveries[1].attempt, 0);
  assert.equal(deliveries[1].last_error, "provider timeout");

  const reminderRegistry = new AppointmentRegistry();
  await reminderRegistry.upsert({
    tenant_id: DERCO_TENANT_ID,
    appointment_id: "apt_reminder_001",
    conversation_id: "legacy_reminder_001",
    reminder_state: "scheduled",
    reminder_deliveries: deliveries,
    status: "requested"
  }, false);
  const reminderAction = await reminderRegistry.applyPanelAction(
    DERCO_TENANT_ID,
    "apt_reminder_001",
    "confirm",
    { persist: false }
  );
  assert.equal(reminderAction.reminder_state, "programmed");
  assert.deepEqual(reminderAction.reminder_deliveries, deliveries, "appointment actions preserve reminder delivery history");

  await registry.upsert({
    tenant_id: DERCO_TENANT_ID,
    conversation_id: "conv_002",
    agent_id: "agent_derco",
    status: "requested",
    customer_name: "Carlos",
    created_at: "2026-07-18T12:00:00Z",
    updated_at: "2026-07-18T12:00:00Z"
  }, false);
  const updated = await registry.applyPanelAction(DERCO_TENANT_ID, "conv_002", "cancel", {
    actor: "Admin DERCO",
    reason: "Cliente no puede asistir",
    persist: false
  });
  assert.equal(updated.status, "cancelled");
  assert.equal(updated.panel_action, "cancel");
  assert.equal(updated.panel_action_status, "queued");
  assert.equal(updated.panel_action_by, "Admin DERCO");
  const reminderRow = await registry.upsert(Object.assign({}, updated, {
    reminder_deliveries: {
      "6h": { status: "delivered", due_at: "2026-07-20T08:00:00Z", sent_at: "2026-07-20T08:01:00Z", attempts: 1, provider_id: "wamid.test" }
    }
  }), false);
  assert.equal(reminderRow.reminder_deliveries["6h"].status, "delivered");
  assert.equal(reminderRow.reminder_deliveries["6h"].provider_id, "wamid.test");
  const virtualReady = normalizeAppointment({
    tenant_id: DERCO_TENANT_ID,
    appointment_id: "virtual-ready",
    status: "booked",
    appointment_modality: "virtual",
    appointment_readiness: "ready",
    virtual_meeting_link: "https://meet.google.com/nextfor-test",
    virtual_link_source: "google_meet",
    physical_maps_link: "javascript:alert(1)"
  });
  assert.strictEqual(virtualReady.virtual_meeting_link, "https://meet.google.com/nextfor-test");
  assert.strictEqual(virtualReady.virtual_link_source, "google_meet");
  assert.strictEqual(virtualReady.physical_maps_link, undefined, "only safe HTTPS location links persist");
  const snapshot = registry.snapshot(DERCO_TENANT_ID, new Date("2026-07-18T12:00:00Z").getTime());
  assert.deepEqual(snapshot.metrics, {
    interactions: 2,
    requested: 2,
    booked: 1,
    pending: 0,
    cancelled: 1,
    failed: 0
  });
  assert.equal(snapshot.upcoming.length, 1);

  console.log("appointments tests: ok");
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
