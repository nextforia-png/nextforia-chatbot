"use strict";

const assert = require("assert");
const {
  buildCoverageConversationContext,
  cloneDefaults,
  createOnboardingRecord,
  normalizeOnboarding,
  onboardingCompletion
} = require("./client-onboarding");

assert.strictEqual(onboardingCompletion(cloneDefaults()), 10);

const normalized = normalizeOnboarding({
  business: { brand_name: "  Tienda Piloto  ", contact_email: "ADMIN@EXAMPLE.COM" },
  meta: { number_status: "invalid" },
  channels: { instagram: true, other: true, other_details: "Marketplace" },
  commerce: { platform: "other", other_platform: "Sistema propio", orders_required: false },
  confirmations: { owns_information: true }
});
assert.strictEqual(normalized.business.brand_name, "Tienda Piloto");
assert.strictEqual(normalized.business.contact_email, "admin@example.com");
assert.strictEqual(normalized.meta.number_status, "unknown");
assert.strictEqual(normalized.channels.instagram, true);
assert.strictEqual(normalized.channels.other_details, "Marketplace");
assert.strictEqual(normalized.commerce.other_platform, "Sistema propio");
assert.strictEqual(normalized.commerce.orders_required, false);
assert.strictEqual(normalized.confirmations.owns_information, true);

const record = createOnboardingRecord(normalized, { tenant_id: "pilot-2", status: "submitted", updated_by: "Admin" });
assert.strictEqual(record.version, 1);
assert.strictEqual(record.tenant_id, "pilot-2");
assert.strictEqual(record.status, "submitted");
assert.ok(record.completion > 0 && record.completion < 100);

const coverageAnswers = cloneDefaults();
coverageAnswers.operations.primary_country = "Colombia";
coverageAnswers.operations.countries_served = "Colombia y Panamá";
const coverageRecord = createOnboardingRecord(coverageAnswers, { tenant_id: "pilot-2", status: "submitted" });
assert.match(buildCoverageConversationContext(coverageRecord), /Países o territorios atendidos: Colombia y Panamá/);
assert.doesNotMatch(buildCoverageConversationContext(coverageRecord), /no parece colombiano/);

console.log("client onboarding tests passed");
