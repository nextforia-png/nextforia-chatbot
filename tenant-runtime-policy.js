"use strict";

function cleanPrompt(value) {
  return String(value || "").trim();
}

function resolveTenantRuntimePolicy(options) {
  options = options || {};
  const customerServicePrompt = cleanPrompt(options.customer_service_prompt);
  const appointmentPrompt = cleanPrompt(options.appointment_prompt);
  const appointmentOperationalPrompt = appointmentPrompt
    ? cleanPrompt(options.appointment_operational_prompt)
    : "";
  const prompts = [customerServicePrompt, appointmentPrompt, appointmentOperationalPrompt].filter(Boolean);
  const ready = prompts.length > 0;
  const businessToolsProfile = ready && customerServicePrompt
    ? String(options.business_tools_profile || "").trim().toLowerCase()
    : "";

  return {
    ready,
    prompts,
    block_reason: ready ? null : "approved_tenant_configuration_required",
    business_tools_profile: businessToolsProfile || null
  };
}

module.exports = { resolveTenantRuntimePolicy };
