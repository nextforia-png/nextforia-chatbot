"use strict";

const crypto = require("crypto");

function cleanText(value, max) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, max || 1000);
}

function cleanTenantId(value) {
  return cleanText(value, 120).toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function appointmentPromptHash(configuration) {
  return crypto.createHash("sha256")
    .update(cleanText(configuration && configuration.system_prompt, 200000))
    .digest("hex");
}

function appointmentAgentIdForTenant(tenantId, agentTenantMap) {
  const cleanTenant = cleanTenantId(tenantId);
  const map = agentTenantMap || {};
  return Object.keys(map).find(function (agentId) {
    return cleanTenantId(map[agentId]) === cleanTenant;
  }) || "";
}

function appointmentAgentConfigured(configuration, tenantId, agentTenantMap) {
  const config = configuration && typeof configuration === "object" ? configuration : {};
  const agentId = appointmentAgentIdForTenant(tenantId, agentTenantMap);
  if (!agentId) return false;
  return config.external_provider === "elevenlabs" &&
    config.external_status === "configured" &&
    config.external_agent_id === agentId &&
    config.external_prompt_hash === appointmentPromptHash(config);
}

function appointmentFirstMessage(configuration) {
  const assistant = cleanText(configuration && configuration.assistant_name, 80) || "Nextfor";
  const business = cleanText(configuration && configuration.business_name, 120) || "tu negocio";
  return "Hola, soy " + assistant + " de " + business + ". Puedo ayudarte a agendar, confirmar o reprogramar tu cita. ¿Qué necesitas?";
}

function buildElevenLabsAppointmentAgentPayload(record, tenantId, options) {
  options = options || {};
  const configuration = record && record.appointment_configuration || {};
  const agentId = cleanText(options.agentId || appointmentAgentIdForTenant(tenantId || record && record.tenant_id, options.agentTenantMap), 160);
  const prompt = cleanText(configuration.system_prompt, 200000);
  if (!prompt) {
    const error = new Error("appointment_configuration_required");
    error.status = 422;
    throw error;
  }
  if (configuration.bot_type !== "appointments") {
    const error = new Error("appointment_not_selected");
    error.status = 422;
    throw error;
  }
  if (configuration.lifecycle !== "approved_for_testing") {
    const error = new Error("appointment_not_in_testing");
    error.status = 422;
    throw error;
  }
  if (!agentId) {
    const error = new Error("elevenlabs_agent_not_mapped");
    error.status = 422;
    throw error;
  }
  const cleanTenant = cleanTenantId(tenantId || record && record.tenant_id);
  const payload = {
    name: cleanText(configuration.business_name, 80)
      ? "Nextfor Appointment · " + cleanText(configuration.business_name, 80)
      : "Nextfor Appointment · " + cleanTenant,
    tags: ["nextfor", "appointments", cleanTenant].filter(Boolean),
    conversation_config: {
      agent: {
        first_message: appointmentFirstMessage(configuration),
        language: "es",
        prompt: { prompt }
      }
    }
  };
  return {
    agent_id: agentId,
    tenant_id: cleanTenant,
    prompt_hash: appointmentPromptHash(configuration),
    endpoint: "https://api.elevenlabs.io/v1/convai/agents/" + encodeURIComponent(agentId),
    payload
  };
}

async function applyElevenLabsAppointmentAgent(record, tenantId, options) {
  options = options || {};
  const draft = buildElevenLabsAppointmentAgentPayload(record, tenantId, options);
  if (!options.apiKey) {
    const error = new Error("elevenlabs_api_key_missing");
    error.status = 422;
    error.draft = draft;
    throw error;
  }
  if (options.writeEnabled !== true) {
    const error = new Error("elevenlabs_write_disabled");
    error.status = 409;
    error.draft = draft;
    throw error;
  }
  const http = options.httpClient;
  if (!http || typeof http.patch !== "function") {
    const error = new Error("elevenlabs_client_unavailable");
    error.status = 503;
    error.draft = draft;
    throw error;
  }
  const response = await http.patch(draft.endpoint, draft.payload, {
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": options.apiKey
    },
    timeout: options.timeoutMs || 15000
  });
  return {
    ok: true,
    applied: true,
    agent_id: draft.agent_id,
    tenant_id: draft.tenant_id,
    prompt_hash: draft.prompt_hash,
    provider_response_status: response && response.status || 200,
    payload: draft.payload
  };
}

function markAppointmentConfigurationElevenLabsApplied(configuration, result, actor, now) {
  return Object.assign({}, configuration, {
    external_provider: "elevenlabs",
    external_status: "configured",
    external_agent_id: cleanText(result && result.agent_id, 160),
    external_prompt_hash: cleanText(result && result.prompt_hash, 80),
    external_configured_at: cleanText(now, 40) || new Date().toISOString(),
    external_configured_by: cleanText(actor, 160),
    external_last_error: ""
  });
}

function markAppointmentConfigurationElevenLabsFailed(configuration, error, actor, now) {
  return Object.assign({}, configuration, {
    external_provider: "elevenlabs",
    external_status: "failed",
    external_configured_by: cleanText(actor, 160),
    external_configured_at: cleanText(now, 40) || new Date().toISOString(),
    external_last_error: cleanText(error && error.message || error, 500)
  });
}

module.exports = {
  applyElevenLabsAppointmentAgent,
  appointmentAgentConfigured,
  appointmentAgentIdForTenant,
  appointmentPromptHash,
  buildElevenLabsAppointmentAgentPayload,
  markAppointmentConfigurationElevenLabsApplied,
  markAppointmentConfigurationElevenLabsFailed
};
