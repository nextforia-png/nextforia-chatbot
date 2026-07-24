"use strict";

const assert = require("assert");
const {
  CUSTOMER_SETUP_QUESTIONS,
  buildCoverageConversationContext,
  cloneDefaults,
  createOnboardingRecord,
  normalizeOnboarding,
  onboardingCompletion
} = require("./client-onboarding");

assert.strictEqual(CUSTOMER_SETUP_QUESTIONS.length, 12);
assert.strictEqual(onboardingCompletion(cloneDefaults()), 0);

const normalized = normalizeOnboarding({
  business: { brand_name: "  Tienda Piloto  ", contact_email: "ADMIN@EXAMPLE.COM" },
  meta: { number_status: "invalid", whatsapp_integration_intent: "yes" },
  channels: { instagram: true, other: true, other_details: "Marketplace" },
  commerce: { platform: "other", other_platform: "Sistema propio", orders_required: false },
  operations: { services_products: "Servicios de agenda", important_policies: "Cancelar con 24 horas" },
  team: { human_support_contact: "Soporte humano" },
  confirmations: { owns_information: true }
});
assert.strictEqual(normalized.business.brand_name, "Tienda Piloto");
assert.strictEqual(normalized.business.contact_email, "admin@example.com");
assert.strictEqual(normalized.meta.number_status, "unknown");
assert.strictEqual(normalized.meta.whatsapp_integration_intent, "yes");
assert.strictEqual(normalized.meta.whatsapp_integration_status, "requested");
assert.strictEqual(normalized.channels.instagram, true);
assert.strictEqual(normalized.channels.other_details, "Marketplace");
assert.strictEqual(normalized.commerce.other_platform, "Sistema propio");
assert.strictEqual(normalized.commerce.orders_required, false);
assert.strictEqual(normalized.operations.services_products, "Servicios de agenda");
assert.strictEqual(normalized.operations.important_policies, "Cancelar con 24 horas");
assert.strictEqual(normalized.team.human_support_contact, "Soporte humano");
assert.strictEqual(normalized.confirmations.owns_information, true);

const record = createOnboardingRecord(normalized, { tenant_id: "pilot-2", status: "submitted", updated_by: "Admin" });
assert.strictEqual(record.version, 2);
assert.strictEqual(record.questionnaire_version, 1);
assert.strictEqual(record.tenant_id, "pilot-2");
assert.strictEqual(record.status, "submitted");
assert.strictEqual(record.setup_completed, false);
assert.ok(record.completion > 0 && record.completion < 100);

const completed = createOnboardingRecord(normalized, { tenant_id: "pilot-2", status: "completed", updated_by: "Admin" });
assert.strictEqual(completed.setup_completed, true);
assert.ok(completed.setup_completed_at);

const coverageAnswers = cloneDefaults();
coverageAnswers.operations.primary_country = "Colombia";
coverageAnswers.operations.countries_served = "Colombia y Panamá";
const coverageRecord = createOnboardingRecord(coverageAnswers, { tenant_id: "pilot-2", status: "submitted" });
assert.match(buildCoverageConversationContext(coverageRecord), /Países o territorios atendidos: Colombia y Panamá/);
assert.doesNotMatch(buildCoverageConversationContext(coverageRecord), /no parece colombiano/);

console.log("client onboarding tests passed");
