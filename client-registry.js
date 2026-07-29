"use strict";

const { cleanTenantId } = require("./tenant-config");

const DERCO_TENANT_ID = "grupo-derco";

const REGISTERED_CLIENTS = Object.freeze({
  [DERCO_TENANT_ID]: Object.freeze({
    tenant_id: DERCO_TENANT_ID,
    customer_number: 1,
    brand_name: "Grupo Jurídico DERCO S.A.S.",
    short_name: "DERCO",
    status: "pilot",
    timezone: "America/Bogota",
    industry: "professional_services",
    modules: Object.freeze({ appointments: "pilot", voice: "pilot" }),
    appointment_provider: "google_calendar"
  })
});

function getRegisteredClient(tenantId) {
  return REGISTERED_CLIENTS[cleanTenantId(tenantId)] || null;
}

function listRegisteredClients() {
  return Object.keys(REGISTERED_CLIENTS).map(function (tenantId) {
    return REGISTERED_CLIENTS[tenantId];
  });
}

function parseAgentTenantMap(env) {
  env = env || {};
  const result = {};
  const raw = String(env.ELEVENLABS_AGENT_TENANT_MAP || "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      Object.keys(parsed || {}).forEach(function (agentId) {
        const tenantId = cleanTenantId(parsed[agentId]);
        if (String(agentId).trim() && tenantId) result[String(agentId).trim()] = tenantId;
      });
    } catch (_) {}
  }
  const dercoAgentId = String(env.ELEVENLABS_DERCO_AGENT_ID || "").trim();
  if (dercoAgentId) result[dercoAgentId] = DERCO_TENANT_ID;
  return Object.freeze(result);
}

module.exports = {
  DERCO_TENANT_ID,
  getRegisteredClient,
  listRegisteredClients,
  parseAgentTenantMap
};
