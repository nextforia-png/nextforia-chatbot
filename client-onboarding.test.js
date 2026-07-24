"use strict";

const assert = require("assert");
const {
  CUSTOMER_SETUP_QUESTIONS,
  buildCustomerSetupQuestionnaireRecord,
  buildCoverageConversationContext,
  cloneDefaults,
  createOnboardingRecord,
  customerSetupQuestionnaireFromTurns,
  customerSetupRequiredPaths,
  normalizeOnboarding,
  normalizeCustomerSetupQuestionnaire,
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

const questionnaire = normalizeCustomerSetupQuestionnaire({
  questions: [
    { id: "company_name", label: "Nombre comercial visible", placeholder: "Ej. Mi marca", order: 2, required: true, active: true, type: "text", path: "ignored.path" },
    { id: "phone", label: "No debería requerirse", order: 1, required: false, active: false, type: "tel" },
    { id: "unknown_question", label: "No entra al contrato" }
  ]
}, "Super Admin", "2026-07-24T18:00:00.000Z");
assert.strictEqual(questionnaire.questions.length, CUSTOMER_SETUP_QUESTIONS.length);
assert.strictEqual(questionnaire.questions[0].id, "phone");
assert.strictEqual(questionnaire.questions.find(function (q) { return q.id === "company_name"; }).path, "business.brand_name");
assert.strictEqual(questionnaire.questions.find(function (q) { return q.id === "company_name"; }).label, "Nombre comercial visible");
assert.strictEqual(questionnaire.questions.find(function (q) { return q.id === "phone"; }).active, false);
assert.ok(!questionnaire.questions.find(function (q) { return q.id === "unknown_question"; }));
assert.ok(!customerSetupRequiredPaths(questionnaire).includes("business.contact_phone"));

const relaxedAnswers = cloneDefaults();
relaxedAnswers.business.brand_name = "Cliente";
const relaxedQuestionnaire = normalizeCustomerSetupQuestionnaire({
  questions: CUSTOMER_SETUP_QUESTIONS.map(function (question) {
    return Object.assign({}, question, { required: question.id === "company_name" });
  })
}, "Super Admin", "2026-07-24T18:05:00.000Z");
assert.strictEqual(onboardingCompletion(relaxedAnswers, relaxedQuestionnaire), 100);

const questionnaireRecord = buildCustomerSetupQuestionnaireRecord(questionnaire);
const restoredQuestionnaire = customerSetupQuestionnaireFromTurns([questionnaireRecord]);
assert.strictEqual(restoredQuestionnaire.updated_by, "Super Admin");
assert.strictEqual(restoredQuestionnaire.questions.find(function (q) { return q.id === "company_name"; }).placeholder, "Ej. Mi marca");

const coverageAnswers = cloneDefaults();
coverageAnswers.operations.primary_country = "Colombia";
coverageAnswers.operations.countries_served = "Colombia y Panamá";
const coverageRecord = createOnboardingRecord(coverageAnswers, { tenant_id: "pilot-2", status: "submitted" });
assert.match(buildCoverageConversationContext(coverageRecord), /Países o territorios atendidos: Colombia y Panamá/);
assert.doesNotMatch(buildCoverageConversationContext(coverageRecord), /no parece colombiano/);

console.log("client onboarding tests passed");
