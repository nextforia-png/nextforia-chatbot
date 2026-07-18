"use strict";

const assert = require("assert");
const {
  cleanTenantId,
  createTenantConfig,
  publicTenantDescriptor,
  validateWhatsAppDestination
} = require("./tenant-config");

const rav = createTenantConfig({
  DEFAULT_TENANT_ID: "RAV Toys",
  TENANT_BRAND_NAME: "RAV Toys",
  TENANT_CUSTOMER_NUMBER: "1",
  TENANT_SERVICE_COUNTRY_CODE: "CO",
  TENANT_SERVICE_COUNTRY_NAME: "Colombia",
  PHONE_NUMBER_ID: "123456"
});

assert.strictEqual(cleanTenantId(" Cliente #2 "), "cliente-2");
assert.strictEqual(rav.id, "rav-toys");
assert.strictEqual(rav.brandName, "RAV Toys");
assert.strictEqual(rav.serviceCountryCode, "CO");
assert.strictEqual(rav.foreignNumberCheckEnabled, true);
assert.deepStrictEqual(validateWhatsAppDestination(rav, { metadata: { phone_number_id: "123456" } }, { requireMetadata: true }), {
  ok: true,
  reason: "matched",
  tenantId: "rav-toys",
  phoneNumberId: "123456"
});
assert.strictEqual(validateWhatsAppDestination(rav, { metadata: { phone_number_id: "other" } }).reason, "phone_number_mismatch");
assert.strictEqual(validateWhatsAppDestination(rav, {}, { requireMetadata: true }).reason, "missing_phone_number_metadata");
assert.strictEqual(validateWhatsAppDestination(rav, {}, { requireMetadata: false }).ok, true);
assert.deepStrictEqual(publicTenantDescriptor(rav), {
  tenant_id: "rav-toys",
  brand_name: "RAV Toys",
  customer_number: 1,
  status: "active",
  phone_number_configured: true,
  service_country_code: "CO",
  service_country_name: "Colombia",
  foreign_number_check_enabled: true
});

console.log("tenant config tests passed");
