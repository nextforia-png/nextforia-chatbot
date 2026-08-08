"use strict";

const assert = require("assert");
const { resolveTenantRuntimePolicy } = require("./tenant-runtime-policy");

const unconfiguredRav = resolveTenantRuntimePolicy({ business_tools_profile: "rav" });
assert.strictEqual(unconfiguredRav.ready, false);
assert.strictEqual(unconfiguredRav.block_reason, "approved_tenant_configuration_required");
assert.strictEqual(unconfiguredRav.business_tools_profile, null, "RAV tools cannot activate without its tenant prompt");
assert.deepStrictEqual(unconfiguredRav.prompts, []);

const configuredRav = resolveTenantRuntimePolicy({
  customer_service_prompt: "Configuración propia de RAV Toys",
  business_tools_profile: "rav"
});
assert.strictEqual(configuredRav.ready, true);
assert.strictEqual(configuredRav.business_tools_profile, "rav");
assert.deepStrictEqual(configuredRav.prompts, ["Configuración propia de RAV Toys"]);

const configuredNextfor = resolveTenantRuntimePolicy({
  customer_service_prompt: "Configuración propia de NextforIA"
});
assert.strictEqual(configuredNextfor.ready, true);
assert.strictEqual(configuredNextfor.business_tools_profile, null);
assert(!configuredNextfor.prompts.join("\n").includes("RAV Toys"));

const appointmentOnly = resolveTenantRuntimePolicy({
  appointment_prompt: "Configuración propia de citas",
  appointment_operational_prompt: "Reglas operativas de citas",
  business_tools_profile: "rav"
});
assert.strictEqual(appointmentOnly.ready, true);
assert.strictEqual(appointmentOnly.business_tools_profile, null);
assert.deepStrictEqual(appointmentOnly.prompts, ["Configuración propia de citas", "Reglas operativas de citas"]);

console.log("tenant-runtime-policy.test.js ok");
