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

function parsePhoneNumberTenantMap(env) {
  env = env || {};
  const result = {};
  const raw = cleanText(env.ELEVENLABS_PHONE_NUMBER_TENANT_MAP, 20000);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      Object.keys(parsed || {}).forEach(function (phoneNumberId) {
        const tenantId = cleanTenantId(parsed[phoneNumberId]);
        if (cleanText(phoneNumberId, 160) && tenantId) result[cleanText(phoneNumberId, 160)] = tenantId;
      });
    } catch (_) {}
  }
  const dercoPhoneNumberId = cleanText(env.ELEVENLABS_DERCO_PHONE_NUMBER_ID, 160);
  if (dercoPhoneNumberId) result[dercoPhoneNumberId] = "grupo-derco";
  return Object.freeze(result);
}

function appointmentPhoneNumberIdForTenant(tenantId, phoneNumberTenantMap) {
  const cleanTenant = cleanTenantId(tenantId);
  const map = phoneNumberTenantMap || {};
  return Object.keys(map).find(function (phoneNumberId) {
    return cleanTenantId(map[phoneNumberId]) === cleanTenant;
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

function appointmentPhoneNumberConfigured(configuration, tenantId, phoneNumberTenantMap) {
  const config = configuration && typeof configuration === "object" ? configuration : {};
  const phoneNumberId = appointmentPhoneNumberIdForTenant(tenantId, phoneNumberTenantMap);
  if (!phoneNumberId) return false;
  return config.external_phone_status === "configured" &&
    config.external_phone_number_id === phoneNumberId &&
    config.external_phone_agent_id === config.external_agent_id;
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

function buildElevenLabsPhoneNumberAssignmentPayload(record, tenantId, options) {
  options = options || {};
  const configuration = record && record.appointment_configuration || {};
  const agentId = cleanText(options.agentId || appointmentAgentIdForTenant(tenantId || record && record.tenant_id, options.agentTenantMap), 160);
  const phoneNumberId = cleanText(options.phoneNumberId || appointmentPhoneNumberIdForTenant(tenantId || record && record.tenant_id, options.phoneNumberTenantMap), 160);
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
  if (!phoneNumberId) {
    const error = new Error("elevenlabs_phone_not_mapped");
    error.status = 422;
    throw error;
  }
  const cleanTenant = cleanTenantId(tenantId || record && record.tenant_id);
  return {
    agent_id: agentId,
    phone_number_id: phoneNumberId,
    tenant_id: cleanTenant,
    endpoint: "https://api.elevenlabs.io/v1/convai/phone-numbers/" + encodeURIComponent(phoneNumberId),
    payload: { agent_id: agentId }
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

async function applyElevenLabsPhoneNumberAssignment(record, tenantId, options) {
  options = options || {};
  const draft = buildElevenLabsPhoneNumberAssignmentPayload(record, tenantId, options);
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
    phone_number_id: draft.phone_number_id,
    tenant_id: draft.tenant_id,
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

function markAppointmentConfigurationPhoneApplied(configuration, result, actor, now) {
  return Object.assign({}, configuration, {
    external_phone_status: "configured",
    external_phone_number_id: cleanText(result && result.phone_number_id, 160),
    external_phone_agent_id: cleanText(result && result.agent_id, 160),
    external_phone_configured_at: cleanText(now, 40) || new Date().toISOString(),
    external_phone_configured_by: cleanText(actor, 160),
    external_phone_last_error: ""
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

function markAppointmentConfigurationPhoneFailed(configuration, error, actor, now) {
  return Object.assign({}, configuration, {
    external_phone_status: "failed",
    external_phone_configured_by: cleanText(actor, 160),
    external_phone_configured_at: cleanText(now, 40) || new Date().toISOString(),
    external_phone_last_error: cleanText(error && error.message || error, 500)
  });
}

module.exports = {
  applyElevenLabsAppointmentAgent,
  applyElevenLabsPhoneNumberAssignment,
  appointmentAgentConfigured,
  appointmentAgentIdForTenant,
  appointmentPhoneNumberConfigured,
  appointmentPhoneNumberIdForTenant,
  appointmentPromptHash,
  buildElevenLabsPhoneNumberAssignmentPayload,
  buildElevenLabsAppointmentAgentPayload,
  markAppointmentConfigurationElevenLabsApplied,
  markAppointmentConfigurationElevenLabsFailed,
  markAppointmentConfigurationPhoneApplied,
  markAppointmentConfigurationPhoneFailed,
  parsePhoneNumberTenantMap
};
