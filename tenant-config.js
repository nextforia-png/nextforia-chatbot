"use strict";

const { normalizeCountryCode } = require("./service-area");

function cleanTenantId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 80);
}

function cleanText(value, fallback, max) {
  const text = String(value || "").trim();
  return (text || fallback || "").slice(0, max || 160);
}

function createTenantConfig(env) {
  env = env || {};
  const customerNumber = Number(env.TENANT_CUSTOMER_NUMBER);
  const serviceCountryCode = normalizeCountryCode(env.TENANT_SERVICE_COUNTRY_CODE, "CO");
  const serviceCountryName = cleanText(env.TENANT_SERVICE_COUNTRY_NAME, serviceCountryCode === "CO" ? "Colombia" : serviceCountryCode, 80);
  return Object.freeze({
    id: cleanTenantId(env.DEFAULT_TENANT_ID) || "rav-toys",
    brandName: cleanText(env.TENANT_BRAND_NAME, "RAV Toys", 120),
    customerNumber: Number.isInteger(customerNumber) && customerNumber > 0 ? customerNumber : 1,
    status: cleanText(env.TENANT_STATUS, "active", 40).toLowerCase(),
    phoneNumberId: cleanText(env.PHONE_NUMBER_ID, "", 120),
    serviceCountryCode,
    serviceCountryName,
    foreignNumberCheckEnabled: String(env.TENANT_FOREIGN_NUMBER_CHECK_ENABLED || "1").trim() !== "0"
  });
}

function validateWhatsAppDestination(config, webhookValue, options) {
  config = config || {};
  webhookValue = webhookValue || {};
  options = options || {};
  const incomingPhoneNumberId = cleanText(webhookValue.metadata && webhookValue.metadata.phone_number_id, "", 120);
  const configuredPhoneNumberId = cleanText(config.phoneNumberId, "", 120);
  const requireMetadata = options.requireMetadata === true;

  if (!configuredPhoneNumberId) {
    return { ok: false, reason: "phone_number_not_configured", tenantId: config.id || null, phoneNumberId: incomingPhoneNumberId || null };
  }
  if (!incomingPhoneNumberId) {
    return {
      ok: !requireMetadata,
      reason: requireMetadata ? "missing_phone_number_metadata" : "legacy_without_metadata",
      tenantId: config.id || null,
      phoneNumberId: configuredPhoneNumberId
    };
  }
  if (incomingPhoneNumberId !== configuredPhoneNumberId) {
    return { ok: false, reason: "phone_number_mismatch", tenantId: config.id || null, phoneNumberId: incomingPhoneNumberId };
  }
  return { ok: true, reason: "matched", tenantId: config.id || null, phoneNumberId: incomingPhoneNumberId };
}

function publicTenantDescriptor(config) {
  return {
    tenant_id: config.id,
    brand_name: config.brandName,
    customer_number: config.customerNumber,
    status: config.status,
    phone_number_configured: !!config.phoneNumberId,
    service_country_code: config.serviceCountryCode,
    service_country_name: config.serviceCountryName,
    foreign_number_check_enabled: config.foreignNumberCheckEnabled !== false
  };
}

module.exports = {
  cleanTenantId,
  createTenantConfig,
  publicTenantDescriptor,
  validateWhatsAppDestination
};
