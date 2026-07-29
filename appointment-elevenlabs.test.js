"use strict";

const assert = require("assert");
const {
  applyElevenLabsAppointmentAgent,
  applyElevenLabsPhoneNumberAssignment,
  appointmentAgentConfigured,
  appointmentPhoneNumberConfigured,
  appointmentPromptHash,
  buildElevenLabsAppointmentAgentPayload,
  buildElevenLabsPhoneNumberAssignmentPayload,
  markAppointmentConfigurationElevenLabsApplied,
  markAppointmentConfigurationPhoneApplied,
  parsePhoneNumberTenantMap
} = require("./appointment-elevenlabs");

const appointmentConfiguration = {
  bot_type: "appointments",
  lifecycle: "approved_for_testing",
  business_name: "Clínica A",
  assistant_name: "Luciana",
  system_prompt: "CONFIGURACIÓN DE APPOINTMENT BOT\nAgenda citas médicas con Google Calendar, WhatsApp y llamadas si están activadas."
};
const record = {
  tenant_id: "clinica-a",
  appointment_configuration: appointmentConfiguration,
  customer_service_configuration: {
    system_prompt: "CUSTOMER-SERVICE-ONLY-SECRET"
  }
};

const draft = buildElevenLabsAppointmentAgentPayload(record, "clinica-a", {
  agentTenantMap: { agent_a: "clinica-a" }
});
assert.strictEqual(draft.agent_id, "agent_a");
assert.strictEqual(draft.tenant_id, "clinica-a");
assert.strictEqual(draft.prompt_hash, appointmentPromptHash(appointmentConfiguration));
assert.match(draft.endpoint, /\/v1\/convai\/agents\/agent_a$/);
assert.strictEqual(draft.payload.conversation_config.agent.language, "es");
assert.match(draft.payload.conversation_config.agent.first_message, /Luciana/);
assert.match(draft.payload.conversation_config.agent.prompt.prompt, /APPOINTMENT BOT/);
assert.doesNotMatch(JSON.stringify(draft.payload), /CUSTOMER-SERVICE-ONLY-SECRET/);

const phoneMap = parsePhoneNumberTenantMap({
  ELEVENLABS_PHONE_NUMBER_TENANT_MAP: JSON.stringify({ phone_123: "clinica-a" })
});
const phoneDraft = buildElevenLabsPhoneNumberAssignmentPayload(record, "clinica-a", {
  agentTenantMap: { agent_a: "clinica-a" },
  phoneNumberTenantMap: phoneMap
});
assert.strictEqual(phoneDraft.phone_number_id, "phone_123");
assert.strictEqual(phoneDraft.agent_id, "agent_a");
assert.match(phoneDraft.endpoint, /\/v1\/convai\/phone-numbers\/phone_123$/);
assert.deepStrictEqual(phoneDraft.payload, { agent_id: "agent_a" });

assert.throws(function () {
  buildElevenLabsAppointmentAgentPayload({
    tenant_id: "clinica-a",
    appointment_configuration: Object.assign({}, appointmentConfiguration, { lifecycle: "draft" })
  }, "clinica-a", { agentTenantMap: { agent_a: "clinica-a" } });
}, /appointment_not_in_testing/);

(async function run() {
  let patched = null;
  const result = await applyElevenLabsAppointmentAgent(record, "clinica-a", {
    apiKey: "el-key",
    agentTenantMap: { agent_a: "clinica-a" },
    writeEnabled: true,
    httpClient: {
      patch: async function (url, payload, options) {
        patched = { url, payload, options };
        return { status: 200 };
      }
    }
  });
  assert.strictEqual(result.applied, true);
  assert.strictEqual(patched.options.headers["xi-api-key"], "el-key");
  const marked = markAppointmentConfigurationElevenLabsApplied(appointmentConfiguration, result, "root", "2026-07-28T12:00:00.000Z");
  assert.strictEqual(appointmentAgentConfigured(marked, "clinica-a", { agent_a: "clinica-a" }), true);
  assert.strictEqual(appointmentAgentConfigured(marked, "clinica-b", { agent_a: "clinica-a" }), false);
  const phoneResult = await applyElevenLabsPhoneNumberAssignment({ tenant_id: "clinica-a", appointment_configuration: marked }, "clinica-a", {
    apiKey: "el-key",
    agentTenantMap: { agent_a: "clinica-a" },
    phoneNumberTenantMap: phoneMap,
    writeEnabled: true,
    httpClient: {
      patch: async function (url, payload, options) {
        patched = { url, payload, options };
        return { status: 200 };
      }
    }
  });
  assert.strictEqual(phoneResult.applied, true);
  const phoneMarked = markAppointmentConfigurationPhoneApplied(marked, phoneResult, "root", "2026-07-28T12:05:00.000Z");
  assert.strictEqual(appointmentPhoneNumberConfigured(phoneMarked, "clinica-a", phoneMap), true);
  console.log("appointment elevenlabs tests: ok");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
