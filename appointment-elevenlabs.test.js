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
  createElevenLabsAppointmentTools,
  markAppointmentConfigurationElevenLabsApplied,
  markAppointmentConfigurationPhoneApplied,
  parsePhoneNumberTenantMap,
  resolveElevenLabsPhoneNumber
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
        if (/\/v1\/convai\/tools$/.test(url)) return { data: { tools: [] } };
        assert.match(url, /agent_luciana_template$/);
        return {
          data: {
            name: "Luciana",
            tags: ["template"],
            platform_settings: {
              privacy: { record_voice: false, retention_days: 30 },
              widget: { text: "DERCO no debe heredarse" }
            },
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
  assert.strictEqual(toolCreates, 4);
  assert.strictEqual(createdPayload.conversation_config.tts.voice_id, "voice_luciana");
  assert.deepStrictEqual(createdPayload.conversation_config.agent.prompt.tool_ids, [
    "tool_nextfor_1",
    "tool_nextfor_2",
    "tool_nextfor_3",
    "tool_nextfor_4"
  ]);
  assert.strictEqual(createdPayload.conversation_config.agent.prompt.knowledge_base, undefined);
  assert.match(createdPayload.conversation_config.agent.prompt.prompt, /APPOINTMENT BOT/);
  assert.match(createdPayload.conversation_config.agent.prompt.prompt, /REGLAS OBLIGATORIAS DE HERRAMIENTAS/);
  assert.strictEqual(createdPayload.conversation_config.agent.first_message.includes("Luciana"), true);
  assert.deepStrictEqual(createdPayload.platform_settings.privacy, { record_voice: false, retention_days: 30 });
  assert.strictEqual(createdPayload.platform_settings.widget, undefined);
  assert.strictEqual(Object.keys(createdPayload.platform_settings.data_collection).includes("appointment_duration_minutes"), true);
  const reusedIds = await createElevenLabsAppointmentTools("clinica-a", {
    apiKey: "el-key",
    toolSecret: "nextfor-appointment-tool-secret-2026-secure",
    baseUrl: "https://api.nextforia.com",
    httpClient: {
      get: async function () {
        return {
          data: {
            tools: createdPayload.conversation_config.agent.prompt.tool_ids.map(function (id, index) {
              const suffix = require("crypto").createHash("sha256").update("clinica-a").digest("hex").slice(0, 10);
              const bases = [
                "nextfor_check_appointment_availability",
                "nextfor_book_appointment",
                "nextfor_cancel_appointment",
                "nextfor_reschedule_appointment"
              ];
              const endpoints = ["availability", "book", "cancel", "reschedule"];
              return {
                id,
                tool_config: {
                  type: "webhook",
                  name: bases[index] + "_" + suffix,
                  api_schema: {
                    url: "https://api.nextforia.com/webhooks/elevenlabs/appointments/clinica-a/" + endpoints[index] +
                      "?token=" + encodeURIComponent(appointmentToolToken("clinica-a", "nextfor-appointment-tool-secret-2026-secure"))
                  }
                }
              };
            })
          }
        };
      },
      post: async function () {
        throw new Error("duplicate_tool_created");
      }
    }
  });
  assert.deepStrictEqual(reusedIds, createdPayload.conversation_config.agent.prompt.tool_ids);
  const selectedPhone = await resolveElevenLabsPhoneNumber({
    tenant_id: "clinica-a",
    appointment_configuration: Object.assign({}, appointmentConfiguration, {
      external_agent_id: "agent_clinica_a"
    })
  }, "clinica-a", {
    apiKey: "el-key",
    agentId: "agent_clinica_a",
    phoneNumberTenantMap: { phone_reserved: "clinica-b" },
    autoAssignEnabled: true,
    httpClient: {
      get: async function (url, options) {
        assert.match(url, /\/v1\/convai\/phone-numbers$/);
        assert.strictEqual(options.headers["xi-api-key"], "el-key");
        return {
          data: [
            { phone_number_id: "phone_reserved", label: "Nextfor citas" },
            { phone_number_id: "phone_busy", assigned_agent_id: "agent_other" },
            { phone_number_id: "phone_generic", label: "General" },
            { phone_number_id: "phone_nextfor", phone_number: "+15550001111", label: "Nextfor Appointment", provider: "twilio" }
          ]
        };
      }
    }
  });
  assert.strictEqual(selectedPhone.phone_number_id, "phone_nextfor");
  assert.strictEqual(selectedPhone.source, "available_inventory");
  const configuredPhone = await resolveElevenLabsPhoneNumber({
    tenant_id: "clinica-a",
    appointment_configuration: Object.assign({}, appointmentConfiguration, {
      external_agent_id: "agent_clinica_a",
      external_phone_number_id: "phone_configured"
    })
  }, "clinica-a", {
    apiKey: "el-key",
    httpClient: {
      get: async function () {
        return {
          data: [
            { phone_number_id: "phone_configured", phone_number: "+15552223333", provider: "twilio" }
          ]
        };
      }
    }
  });
  assert.strictEqual(configuredPhone.phone_number, "+15552223333");
  assert.strictEqual(configuredPhone.provider, "twilio");
  const phoneResult = await applyElevenLabsPhoneNumberAssignment({ tenant_id: "clinica-a", appointment_configuration: marked }, "clinica-a", {
    apiKey: "el-key",
    phoneNumber: "+15550001111",
    phoneProvider: "twilio",
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
  assert.strictEqual(phoneResult.phone_number, "+15550001111");
  assert.strictEqual(phoneResult.phone_provider, "twilio");
  const phoneMarked = markAppointmentConfigurationPhoneApplied(marked, phoneResult, "root", "2026-07-28T12:05:00.000Z");
  assert.strictEqual(phoneMarked.external_phone_number, "+15550001111");
  assert.strictEqual(phoneMarked.external_phone_provider, "twilio");
  assert.strictEqual(appointmentPhoneNumberConfigured(phoneMarked, "clinica-a", phoneMap), true);
  assert.strictEqual(appointmentPhoneNumberConfigured({
    external_status: "configured",
    external_agent_id: "agent_clinica_a",
    external_phone_status: "configured",
    external_phone_number_id: "phone_auto",
    external_phone_agent_id: "agent_clinica_a"
  }, "clinica-a", {}), true);
  console.log("appointment elevenlabs tests: ok");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
