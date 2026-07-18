"use strict";

const DEFAULT_ONBOARDING = Object.freeze({
  business: {
    brand_name: "",
    legal_name: "",
    tax_id: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    website: "",
    privacy_policy_url: ""
  },
  meta: {
    business_portfolio_ready: "unknown",
    admin_available: "unknown",
    whatsapp_number: "",
    number_status: "unknown",
    desired_number_strategy: "review",
    facebook_page: "",
    instagram_account: ""
  },
  channels: {
    whatsapp: true,
    instagram: false,
    messenger: false,
    web_chat: false,
    email: false,
    phone_calls: false,
    other: false,
    service_email: "",
    web_chat_url: "",
    other_details: "",
    integration_notes: ""
  },
  commerce: {
    platform: "shopify",
    other_platform: "",
    store_url: "",
    catalog_ready: "unknown",
    orders_required: true,
    access_owner: ""
  },
  operations: {
    primary_country: "Colombia",
    countries_served: "Colombia",
    foreign_number_location_check: true,
    business_hours: "",
    support_hours: "",
    payments: "",
    shipping: "",
    warranties: "",
    frequent_questions: "",
    handoff_cases: ""
  },
  team: {
    admin_name: "",
    admin_email: "",
    agents: "",
    notification_phone: "",
    pilot_start: ""
  },
  confirmations: {
    owns_information: false,
    accepts_guided_setup: false,
    understands_meta_dependency: false
  }
});

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_ONBOARDING));
}

function text(value, max) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, max || 2000);
}

function choice(value, allowed, fallback) {
  const clean = text(value, 60).toLowerCase();
  return allowed.includes(clean) ? clean : fallback;
}

function normalizeOnboarding(input) {
  input = input && typeof input === "object" ? input : {};
  const business = input.business || {};
  const meta = input.meta || {};
  const channels = input.channels || {};
  const commerce = input.commerce || {};
  const operations = input.operations || {};
  const team = input.team || {};
  const confirmations = input.confirmations || {};
  const yesNoUnknown = ["yes", "no", "unknown"];
  return {
    business: {
      brand_name: text(business.brand_name, 120),
      legal_name: text(business.legal_name, 180),
      tax_id: text(business.tax_id, 80),
      contact_name: text(business.contact_name, 120),
      contact_email: text(business.contact_email, 180).toLowerCase(),
      contact_phone: text(business.contact_phone, 40),
      website: text(business.website, 500),
      privacy_policy_url: text(business.privacy_policy_url, 500)
    },
    meta: {
      business_portfolio_ready: choice(meta.business_portfolio_ready, yesNoUnknown, "unknown"),
      admin_available: choice(meta.admin_available, yesNoUnknown, "unknown"),
      whatsapp_number: text(meta.whatsapp_number, 40),
      number_status: choice(meta.number_status, ["new", "business_app", "cloud_api", "unknown"], "unknown"),
      desired_number_strategy: choice(meta.desired_number_strategy, ["new", "migrate", "coexistence", "review"], "review"),
      facebook_page: text(meta.facebook_page, 300),
      instagram_account: text(meta.instagram_account, 160)
    },
    channels: {
      whatsapp: channels.whatsapp !== false,
      instagram: !!channels.instagram,
      messenger: !!channels.messenger,
      web_chat: !!channels.web_chat,
      email: !!channels.email,
      phone_calls: !!channels.phone_calls,
      other: !!channels.other,
      service_email: text(channels.service_email, 180).toLowerCase(),
      web_chat_url: text(channels.web_chat_url, 500),
      other_details: text(channels.other_details, 800),
      integration_notes: text(channels.integration_notes, 1600)
    },
    commerce: {
      platform: choice(commerce.platform, ["shopify", "woocommerce", "csv", "api", "other", "none"], "shopify"),
      other_platform: text(commerce.other_platform, 160),
      store_url: text(commerce.store_url, 500),
      catalog_ready: choice(commerce.catalog_ready, yesNoUnknown, "unknown"),
      orders_required: commerce.orders_required !== false,
      access_owner: text(commerce.access_owner, 120)
    },
    operations: {
      primary_country: text(operations.primary_country, 120) || "Colombia",
      countries_served: text(operations.countries_served, 1200),
      foreign_number_location_check: operations.foreign_number_location_check !== false,
      business_hours: text(operations.business_hours, 1200),
      support_hours: text(operations.support_hours, 1200),
      payments: text(operations.payments, 2500),
      shipping: text(operations.shipping, 2500),
      warranties: text(operations.warranties, 2500),
      frequent_questions: text(operations.frequent_questions, 4000),
      handoff_cases: text(operations.handoff_cases, 3000)
    },
    team: {
      admin_name: text(team.admin_name, 120),
      admin_email: text(team.admin_email, 180).toLowerCase(),
      agents: text(team.agents, 1500),
      notification_phone: text(team.notification_phone, 40),
      pilot_start: text(team.pilot_start, 20)
    },
    confirmations: {
      owns_information: !!confirmations.owns_information,
      accepts_guided_setup: !!confirmations.accepts_guided_setup,
      understands_meta_dependency: !!confirmations.understands_meta_dependency
    }
  };
}

function getPath(source, path) {
  return path.split(".").reduce(function (value, key) { return value && value[key]; }, source);
}

const REQUIRED_PATHS = [
  "business.brand_name",
  "business.legal_name",
  "business.tax_id",
  "business.contact_name",
  "business.contact_email",
  "business.contact_phone",
  "business.website",
  "business.privacy_policy_url",
  "meta.business_portfolio_ready",
  "meta.admin_available",
  "meta.whatsapp_number",
  "meta.number_status",
  "commerce.platform",
  "commerce.store_url",
  "commerce.catalog_ready",
  "operations.business_hours",
  "operations.primary_country",
  "operations.countries_served",
  "operations.support_hours",
  "operations.payments",
  "operations.shipping",
  "operations.warranties",
  "operations.frequent_questions",
  "operations.handoff_cases",
  "team.admin_name",
  "team.admin_email",
  "team.notification_phone",
  "confirmations.owns_information",
  "confirmations.accepts_guided_setup",
  "confirmations.understands_meta_dependency"
];

function onboardingCompletion(input) {
  const answers = normalizeOnboarding(input);
  const requiredPaths = REQUIRED_PATHS.concat(answers.commerce.platform === "other" ? ["commerce.other_platform"] : []);
  const complete = requiredPaths.filter(function (path) {
    const value = getPath(answers, path);
    return value !== "" && value !== "unknown" && value !== false && value != null;
  }).length;
  return Math.round(complete / requiredPaths.length * 100);
}

function createOnboardingRecord(input, meta) {
  const answers = normalizeOnboarding(input);
  const now = new Date().toISOString();
  return {
    version: 1,
    tenant_id: text(meta && meta.tenant_id, 80),
    status: choice(meta && meta.status, ["draft", "submitted", "in_review", "ready"], "draft"),
    completion: onboardingCompletion(answers),
    answers,
    updated_at: now,
    updated_by: text(meta && meta.updated_by, 120)
  };
}

function buildCoverageConversationContext(record) {
  if (!record || !["submitted", "in_review", "ready"].includes(record.status) || !record.answers) return "";
  const operations = record.answers.operations || {};
  const primaryCountry = text(operations.primary_country, 120);
  const countriesServed = text(operations.countries_served, 1200);
  const lines = [];
  if (primaryCountry) lines.push("País principal del negocio: " + primaryCountry + ".");
  if (countriesServed) lines.push("Países o territorios atendidos: " + countriesServed + ".");
  return lines.length ? "COBERTURA GEOGRÁFICA DEL CLIENTE:\n" + lines.join("\n") : "";
}

module.exports = {
  DEFAULT_ONBOARDING,
  REQUIRED_PATHS,
  buildCoverageConversationContext,
  cloneDefaults,
  createOnboardingRecord,
  normalizeOnboarding,
  onboardingCompletion
};
