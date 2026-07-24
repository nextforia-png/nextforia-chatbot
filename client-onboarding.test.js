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

assert.strictEqual(onboardingCompletion(cloneDefaults()), 0);
assert.deepStrictEqual(
  CUSTOMER_SETUP_QUESTIONS.map(function (question) { return question.order; }),
  CUSTOMER_SETUP_QUESTIONS.map(function (question) { return question.order; }).slice().sort(function (a, b) { return a - b; })
);
assert.strictEqual(new Set(CUSTOMER_SETUP_QUESTIONS.map(function (question) { return question.id; })).size, CUSTOMER_SETUP_QUESTIONS.length);
assert(CUSTOMER_SETUP_QUESTIONS.every(function (question) { return question.active && question.path && question.type; }));

const normalized = normalizeOnboarding({
  business: { brand_name: "  Tienda Piloto  ", contact_email: "ADMIN@EXAMPLE.COM" },
  meta: { number_status: "invalid", whatsapp_integration_intent: "yes" },
  channels: { instagram: true, other: true, other_details: "Marketplace" },
  commerce: { platform: "other", other_platform: "Sistema propio", orders_required: false },
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
assert.strictEqual(normalized.confirmations.owns_information, true);

const record = createOnboardingRecord(normalized, { tenant_id: "pilot-2", status: "submitted", updated_by: "Admin" });
assert.strictEqual(record.version, 2);
assert.strictEqual(record.tenant_id, "pilot-2");
assert.strictEqual(record.status, "submitted");
assert.ok(record.completion > 0 && record.completion < 100);
assert.strictEqual(record.setup_completed, false);
assert.strictEqual(record.setup_completed_at, null);
assert.ok(record.last_updated_at);

const completedAnswers = cloneDefaults();
completedAnswers.business.brand_name = "Empresa Completa";
completedAnswers.business.contact_email = "admin@completa.example";
completedAnswers.business.contact_phone = "+57 300 000 0000";
completedAnswers.meta.whatsapp_number = "+57 300 000 0000";
completedAnswers.meta.whatsapp_integration_intent = "yes";
completedAnswers.operations.business_hours = "Lunes a viernes";
completedAnswers.operations.services_products = "Servicios";
completedAnswers.operations.frequent_questions = "Preguntas y respuestas";
completedAnswers.operations.important_policies = "Políticas";
completedAnswers.operations.bot_instructions = "Responder con claridad";
completedAnswers.team.admin_email = "admin@completa.example";
completedAnswers.team.human_support_contact = "Soporte +57 300 000 0000";
assert.strictEqual(onboardingCompletion(completedAnswers), 100);
const completedRecord = createOnboardingRecord(completedAnswers, { tenant_id: "completa", status: "completed" });
assert.strictEqual(completedRecord.setup_completed, true);
assert.ok(completedRecord.setup_completed_at);
const editedRecord = createOnboardingRecord(completedAnswers, { tenant_id: "completa", status: "draft", previous: completedRecord });
assert.strictEqual(editedRecord.setup_completed, true);
assert.strictEqual(editedRecord.setup_completed_at, completedRecord.setup_completed_at);

const coverageAnswers = cloneDefaults();
coverageAnswers.operations.primary_country = "Colombia";
coverageAnswers.operations.countries_served = "Colombia y Panamá";
const coverageRecord = createOnboardingRecord(coverageAnswers, { tenant_id: "pilot-2", status: "submitted" });
assert.match(buildCoverageConversationContext(coverageRecord), /Países o territorios atendidos: Colombia y Panamá/);
assert.doesNotMatch(buildCoverageConversationContext(coverageRecord), /no parece colombiano/);

console.log("client onboarding tests passed");
