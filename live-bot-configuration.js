"use strict";

const crypto = require("crypto");
const {
  generateCustomerServiceConfiguration,
  normalizeCustomerServiceConfiguration
} = require("./client-onboarding");
const {
  buildBotPersonalityPrompt,
  personalityForOnboarding
} = require("./bot-personality");

function cleanGoal(record) {
  return String(record && record.answers && record.answers.setup_goal || "").trim().toLowerCase();
}

function customerServiceContracted(record) {
  return ["customer_service", "both"].includes(cleanGoal(record));
}

function customerServiceApproved(record) {
  const configuration = record && record.customer_service_configuration;
  const reviewStatus = String(record && record.setup_review && record.setup_review.status || "").toLowerCase();
  const setupStatus = String(record && record.answers && record.answers.customer_service_setup &&
    record.answers.customer_service_setup.setup_status || "").toLowerCase();
  return !!(configuration && configuration.lifecycle === "approved_for_testing") ||
    reviewStatus === "live" || setupStatus === "active";
}

function canonicalCustomerServiceConfiguration(record) {
  if (!customerServiceContracted(record)) return null;
  const existing = record && record.customer_service_configuration;
  const approved = customerServiceApproved(record);
  if (existing) {
    return normalizeCustomerServiceConfiguration(existing, {
      actor: existing.updated_by,
      lifecycle: approved ? "approved_for_testing" : existing.lifecycle,
      now: existing.updated_at || record.updated_at
    });
  }
  if (!approved) return null;
  const generated = generateCustomerServiceConfiguration(record.answers, {
    actor: record.updated_by || "Nextfor runtime",
    source_setup_updated_at: record.last_updated_at || record.updated_at,
    now: record.last_updated_at || record.updated_at
  });
  return generated
    ? normalizeCustomerServiceConfiguration(generated, {
      actor: record.updated_by || "Nextfor runtime",
      lifecycle: "approved_for_testing",
      now: record.last_updated_at || record.updated_at
    })
    : null;
}

function joinConfigurationValues(values) {
  return (values || []).map(function (value) {
    return String(value == null ? "" : value).trim();
  }).filter(Boolean).join("\n");
}

function paymentMethodsText(methods) {
  const labels = {
    nequi_daviplata: "Nequi o Daviplata",
    transfer: "transferencia",
    cash_on_delivery: "contraentrega",
    payment_link: "link de pago",
    card: "tarjeta"
  };
  return (methods || []).map(function (method) {
    return labels[method] || method;
  }).join(", ");
}

function escalationTriggersText(triggers) {
  const labels = {
    customer_requests: "el cliente pide hablar con una persona",
    customer_upset: "el cliente está molesto",
    three_failed_attempts: "hay 3 intentos sin resolver",
    claim_or_warranty: "hay reclamo o garantía",
    special_discount: "piden un descuento especial",
    unknown_answer: "el bot no conoce la respuesta"
  };
  return (triggers || []).map(function (trigger) {
    return labels[trigger] || trigger;
  }).join("; ");
}

function conversationToneText(personality) {
  const labels = { cercano: "Cercano", formal: "Formal", directo: "Directo" };
  const greeting = personality && personality.greeting || {};
  const farewell = personality && personality.farewell || {};
  return joinConfigurationValues([
    "Saludo: " + (labels[greeting.tone] || greeting.tone || "cercano"),
    "Despedida: " + (labels[farewell.tone] || farewell.tone || "cercano")
  ]);
}

function effectiveCustomerServiceConfiguration(service, personality) {
  if (!service) return null;
  const current = personality || {};
  const profile = current.profile || {};
  const business = current.business || {};
  const shipping = current.shipping || {};
  const payments = current.payments || {};
  const escalation = current.escalation || {};
  const updated = Object.assign({}, service, {
    assistant_name: profile.display_name || service.assistant_name,
    business_summary: profile.description || "",
    value_proposition: profile.description || "",
    support_hours: business.hours || "",
    important_policies: business.returns_policy || "",
    warranties: "",
    frequent_questions: (current.faqs || []).map(function (faq) {
      return "Pregunta: " + faq.question + "\nRespuesta: " + faq.answer;
    }).join("\n\n"),
    shipping: (shipping.fields || []).map(function (field, index) {
      return (index + 1) + ". " + field.label + (field.required ? " (obligatorio)" : " (opcional)");
    }).join("\n"),
    payments: joinConfigurationValues([
      paymentMethodsText(payments.methods),
      payments.confirmation_message
    ]),
    tone: conversationToneText(current),
    brand_restrictions: current.avoided_words || "",
    bot_instructions: joinConfigurationValues([
      current.custom_instructions,
      current.preferred_words ? "Expresiones preferidas: " + current.preferred_words : "",
      current.extra_context
    ]),
    handoff_cases: escalationTriggersText(escalation.triggers),
    handoff_contact: escalation.notify_contact || ""
  });
  return normalizeCustomerServiceConfiguration(updated, {
    actor: service.updated_by,
    lifecycle: service.lifecycle,
    now: current.updated_at || service.updated_at
  });
}

function stableFingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function resolveLiveBotConfiguration(record, options) {
  options = options || {};
  const tenantId = String(options.tenant_id || record && record.tenant_id || "").trim().toLowerCase();
  const planId = options.plan_id || record && record.bot_personality && record.bot_personality.plan_id;
  const contracted = customerServiceContracted(record);
  const personality = personalityForOnboarding(record || {}, planId);
  const canonicalService = canonicalCustomerServiceConfiguration(record);
  const service = effectiveCustomerServiceConfiguration(canonicalService, personality);
  const active = !!(contracted && service && service.lifecycle === "approved_for_testing" && service.system_prompt);
  const personalityPrompt = active ? buildBotPersonalityPrompt(personality, { plan_id: planId }) : "";
  const prompts = active ? [service.system_prompt, personalityPrompt].filter(Boolean) : [];
  const fingerprint = stableFingerprint({
    tenant_id: tenantId,
    goal: cleanGoal(record),
    prompts
  });
  return {
    source: "client-onboarding",
    tenant_id: tenantId,
    contracted,
    approved: customerServiceApproved(record),
    active,
    customer_service_configuration: service,
    personality,
    personality_prompt: personalityPrompt,
    prompts,
    fingerprint,
    applied_at: personality.updated_at || record && (record.last_updated_at || record.updated_at) || null
  };
}

module.exports = {
  canonicalCustomerServiceConfiguration,
  customerServiceApproved,
  customerServiceContracted,
  effectiveCustomerServiceConfiguration,
  resolveLiveBotConfiguration,
  stableFingerprint
};
