"use strict";

const assert = require("assert");
const {
  applyElevenLabsAppointmentAgent,
  applyElevenLabsPhoneNumberAssignment,
  appointmentAgentConfigured,
  appointmentPhoneNumberConfigured,
  appointmentPromptHash,
  appointmentToolToken,
  buildElevenLabsAppointmentAgentPayload,
  buildElevenLabsPhoneNumberAssignmentPayload,
  createElevenLabsAppointmentAgentFromTemplate,
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
assert.notStrictEqual(
  appointmentToolToken("clinica-a", "nextfor-appointment-tool-secret-2026-secure"),
  appointmentToolToken("clinica-b", "nextfor-appointment-tool-secret-2026-secure")
);

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
  let createdPayload = null;
  let toolCreates = 0;
  const cloned = await createElevenLabsAppointmentAgentFromTemplate(record, "clinica-a", {
    apiKey: "el-key",
    templateAgentId: "agent_luciana_template",
    toolSecret: "nextfor-appointment-tool-secret-2026-secure",
    toolBaseUrl: "https://api.nextforia.com",
    writeEnabled: true,
    httpClient: {
      get: async function (url) {
        assert.match(url, /agent_luciana_template$/);
        return {
          data: {
            name: "Luciana",
            tags: ["template"],
            conversation_config: {
              tts: { voice_id: "voice_luciana" },
              agent: {
                first_message: "Mensaje original",
                language: "es",
                prompt: { prompt: "PROMPT ORIGINAL", tool_ids: ["tool_calendar"] }
              }
            }
          }
        };
      },
      post: async function (url, payload, options) {
        assert.strictEqual(options.headers["xi-api-key"], "el-key");
        if (/\/v1\/convai\/tools$/.test(url)) {
          toolCreates += 1;
          assert.match(payload.tool_config.api_schema.url, /api\.nextforia\.com\/webhooks\/elevenlabs\/appointments\/clinica-a/);
          return { status: 200, data: { id: "tool_nextfor_" + toolCreates } };
        }
        assert.match(url, /\/v1\/convai\/agents\/create$/);
        createdPayload = payload;
        return { status: 200, data: { agent_id: "agent_clinica_a" } };
      }
    }
  });
  assert.strictEqual(cloned.created, true);
  assert.strictEqual(cloned.agent_id, "agent_clinica_a");
  assert.strictEqual(toolCreates, 2);
  assert.strictEqual(createdPayload.conversation_config.tts.voice_id, "voice_luciana");
  assert.deepStrictEqual(createdPayload.conversation_config.agent.prompt.tool_ids, ["tool_nextfor_1", "tool_nextfor_2"]);
  assert.strictEqual(createdPayload.conversation_config.agent.prompt.knowledge_base, undefined);
  assert.match(createdPayload.conversation_config.agent.prompt.prompt, /APPOINTMENT BOT/);
  assert.strictEqual(createdPayload.conversation_config.agent.first_message.includes("Luciana"), true);
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
