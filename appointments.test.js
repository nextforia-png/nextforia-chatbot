"use strict";

const assert = require("assert");
const {
  AppointmentRegistry,
  appointmentFromElevenLabsEvent,
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
