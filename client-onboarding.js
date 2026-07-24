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
    whatsapp_integration_intent: "unknown",
    whatsapp_integration_status: "not_requested",
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
    services_products: "",
    support_hours: "",
    payments: "",
    shipping: "",
    warranties: "",
    important_policies: "",
    frequent_questions: "",
    handoff_cases: "",
    bot_instructions: ""
  },
  team: {
    admin_name: "",
    admin_email: "",
    agents: "",
    notification_phone: "",
    human_support_contact: "",
    pilot_start: ""
  },
  confirmations: {
    owns_information: false,
    accepts_guided_setup: false,
    understands_meta_dependency: false
  }
});

const CUSTOMER_SETUP_QUESTIONS = Object.freeze([
  { id: "company_name", path: "business.brand_name", section: "business", order: 10, active: true, required: true, type: "text", label: "¿Cómo se llama tu empresa?", placeholder: "Ej. RAV Toys" },
  { id: "administrator_email", path: "team.admin_email", section: "business", order: 20, active: true, required: true, type: "email_readonly", label: "Correo del administrador", placeholder: "admin@empresa.com" },
  { id: "contact_email", path: "business.contact_email", section: "business", order: 30, active: true, required: true, type: "email", label: "Correo de contacto", placeholder: "contacto@empresa.com" },
  { id: "phone", path: "business.contact_phone", section: "business", order: 40, active: true, required: true, type: "tel", label: "Teléfono", placeholder: "+57..." },
  { id: "whatsapp", path: "meta.whatsapp_number", section: "business", order: 50, active: true, required: true, type: "tel", label: "WhatsApp", placeholder: "+57..." },
  { id: "whatsapp_integration_intent", path: "meta.whatsapp_integration_intent", section: "business", order: 60, active: true, required: true, type: "choice", label: "¿Quieres integrar este WhatsApp con Meta desde Nextfor IA?", placeholder: "" },
  { id: "business_hours", path: "operations.business_hours", section: "business", order: 70, active: true, required: true, type: "textarea", label: "Horarios de atención", placeholder: "Días, horas y festivos" },
  { id: "services_products", path: "operations.services_products", section: "offering", order: 80, active: true, required: true, type: "textarea", label: "Servicios o productos", placeholder: "Qué vende u ofrece el negocio." },
  { id: "frequently_asked_questions", path: "operations.frequent_questions", section: "offering", order: 90, active: true, required: true, type: "textarea", label: "Preguntas frecuentes", placeholder: "Pregunta y respuesta ideal. Una por línea." },
  { id: "important_policies", path: "operations.important_policies", section: "offering", order: 100, active: true, required: true, type: "textarea", label: "Políticas importantes", placeholder: "Garantías, cambios, privacidad, cancelaciones y excepciones." },
  { id: "human_support_contact", path: "team.human_support_contact", section: "voice", order: 110, active: true, required: true, type: "text", label: "Contacto de soporte humano", placeholder: "Nombre, teléfono, correo o área." },
  { id: "bot_communication_instructions", path: "operations.bot_instructions", section: "voice", order: 120, active: true, required: true, type: "textarea", label: "Instrucciones de comunicación del bot", placeholder: "Tono, límites y reglas especiales para responder." }
]);

const CUSTOMER_SETUP_QUESTIONNAIRE_TOOL = "customer_setup_questionnaire_v1";
const CUSTOMER_SETUP_QUESTIONNAIRE_RECORD_ID = "customer-setup-questionnaire:nexforia";
const CUSTOMER_SETUP_QUESTIONNAIRE_PREFIX = "[CustomerSetupQuestionnaire] ";
const QUESTION_TYPES = ["text", "email", "email_readonly", "tel", "textarea", "choice"];

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
  const whatsappIntent = choice(meta.whatsapp_integration_intent, ["yes", "later", "no", "unknown"], "unknown");
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
      whatsapp_integration_intent: whatsappIntent,
      whatsapp_integration_status: choice(
        meta.whatsapp_integration_status,
        ["not_requested", "requested", "pending_customer", "connected", "needs_review", "failed"],
        whatsappIntent === "yes" ? "requested" : whatsappIntent === "later" ? "pending_customer" : "not_requested"
      ),
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
      services_products: text(operations.services_products, 5000),
      support_hours: text(operations.support_hours, 1200),
      payments: text(operations.payments, 2500),
      shipping: text(operations.shipping, 2500),
      warranties: text(operations.warranties, 2500),
      important_policies: text(operations.important_policies, 5000),
      frequent_questions: text(operations.frequent_questions, 4000),
      handoff_cases: text(operations.handoff_cases, 3000),
      bot_instructions: text(operations.bot_instructions, 5000)
    },
    team: {
      admin_name: text(team.admin_name, 120),
      admin_email: text(team.admin_email, 180).toLowerCase(),
      agents: text(team.agents, 1500),
      notification_phone: text(team.notification_phone, 40),
      human_support_contact: text(team.human_support_contact, 1000),
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

const REQUIRED_PATHS = CUSTOMER_SETUP_QUESTIONS
  .filter(function (question) { return question.active && question.required; })
  .sort(function (a, b) { return a.order - b.order; })
  .map(function (question) { return question.path; });

function normalizeCustomerSetupQuestionnaire(input, actor, now) {
  const incoming = Array.isArray(input && input.questions) ? input.questions : Array.isArray(input) ? input : [];
  const byId = new Map(incoming.map(function (question) { return [text(question && question.id, 80), question || {}]; }));
  const questions = CUSTOMER_SETUP_QUESTIONS.map(function (base) {
    const src = byId.get(base.id) || {};
    const type = choice(src.type, QUESTION_TYPES, base.type);
    const label = text(src.label == null ? base.label : src.label, 160) || base.label;
    const placeholder = text(src.placeholder == null ? base.placeholder : src.placeholder, 280);
    const order = Math.max(1, Math.min(999, Math.round(Number(src.order == null ? base.order : src.order) || base.order)));
    return {
      id: base.id,
      path: base.path,
      section: base.section,
      order,
      active: src.active == null ? base.active !== false : src.active === true,
      required: src.required == null ? base.required === true : src.required === true,
      type,
      label,
      placeholder
    };
  }).sort(function (a, b) { return a.order - b.order; });
  return {
    version: 1,
    questions,
    updated_at: now || new Date().toISOString(),
    updated_by: text(actor || "super_admin", 120)
  };
}

function customerSetupRequiredPaths(questionnaire) {
  const questions = questionnaire && Array.isArray(questionnaire.questions) ? questionnaire.questions : CUSTOMER_SETUP_QUESTIONS;
  const active = questions.filter(function (question) { return question.active !== false && question.required === true; });
  return (active.length ? active : CUSTOMER_SETUP_QUESTIONS.filter(function (question) { return question.active && question.required; }))
    .sort(function (a, b) { return a.order - b.order; })
    .map(function (question) { return question.path; });
}

function onboardingCompletion(input, questionnaire) {
  const answers = normalizeOnboarding(input);
  const requiredPaths = customerSetupRequiredPaths(questionnaire);
  const complete = requiredPaths.filter(function (path) {
    const value = getPath(answers, path);
    return value !== "" && value !== "unknown" && value !== false && value != null;
  }).length;
  return Math.round(complete / requiredPaths.length * 100);
}

function createOnboardingRecord(input, meta) {
  meta = meta || {};
  const answers = normalizeOnboarding(input);
  const questionnaire = normalizeCustomerSetupQuestionnaire(meta.questionnaire || {}, meta.updated_by || "system");
  const now = new Date().toISOString();
  const status = choice(meta.status, ["draft", "submitted", "completed", "in_review", "ready"], "draft");
  const previous = meta.previous && typeof meta.previous === "object" ? meta.previous : {};
  const setupCompleted = previous.setup_completed === true || status === "completed";
  const setupCompletedAt = setupCompleted
    ? (previous.setup_completed_at || meta.setup_completed_at || now)
    : null;
  return {
    version: 2,
    questionnaire_version: questionnaire.version,
    tenant_id: text(meta.tenant_id, 80),
    status,
    completion: onboardingCompletion(answers, questionnaire),
    setup_completed: setupCompleted,
    setup_completed_at: setupCompletedAt,
    last_updated_at: now,
    answers,
    updated_at: now,
    updated_by: text(meta.updated_by, 120)
  };
}

function parseCustomerSetupQuestionnaireTurn(turn) {
  const tools = Array.isArray(turn && turn.tools) ? turn.tools : [];
  if (!tools.includes(CUSTOMER_SETUP_QUESTIONNAIRE_TOOL)) return null;
  const raw = String(turn.botReply || "");
  if (!raw.startsWith(CUSTOMER_SETUP_QUESTIONNAIRE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(CUSTOMER_SETUP_QUESTIONNAIRE_PREFIX.length));
    if (parsed.version !== 1) return null;
    return normalizeCustomerSetupQuestionnaire(parsed, parsed.updated_by, parsed.updated_at);
  } catch (_) {
    return null;
  }
}

function customerSetupQuestionnaireFromTurns(turns) {
  let current = normalizeCustomerSetupQuestionnaire({}, "system", null);
  (turns || []).slice().sort(function (a, b) {
    return new Date(a.ts || 0) - new Date(b.ts || 0);
  }).forEach(function (turn) {
    const parsed = parseCustomerSetupQuestionnaireTurn(turn);
    if (parsed) current = parsed;
  });
  return current;
}

function buildCustomerSetupQuestionnaireRecord(questionnaire) {
  return {
    ts: questionnaire.updated_at,
    userId: CUSTOMER_SETUP_QUESTIONNAIRE_RECORD_ID,
    userMessage: "",
    botReply: CUSTOMER_SETUP_QUESTIONNAIRE_PREFIX + JSON.stringify(questionnaire),
    tools: [CUSTOMER_SETUP_QUESTIONNAIRE_TOOL],
    zeroResultQueries: [],
    handoff: false,
    rating: null,
    numTools: 1,
    status: "ok",
    eval: { skip: true, reason: CUSTOMER_SETUP_QUESTIONNAIRE_TOOL }
  };
}

function buildCoverageConversationContext(record) {
  if (!record || !["submitted", "completed", "in_review", "ready"].includes(record.status) || !record.answers) return "";
  const operations = record.answers.operations || {};
  const primaryCountry = text(operations.primary_country, 120);
  const countriesServed = text(operations.countries_served, 1200);
  const lines = [];
  if (primaryCountry) lines.push("País principal del negocio: " + primaryCountry + ".");
  if (countriesServed) lines.push("Países o territorios atendidos: " + countriesServed + ".");
  return lines.length ? "COBERTURA GEOGRÁFICA DEL CLIENTE:\n" + lines.join("\n") : "";
}

module.exports = {
  CUSTOMER_SETUP_QUESTIONNAIRE_RECORD_ID,
  CUSTOMER_SETUP_QUESTIONNAIRE_TOOL,
  CUSTOMER_SETUP_QUESTIONS,
  DEFAULT_ONBOARDING,
  REQUIRED_PATHS,
  buildCustomerSetupQuestionnaireRecord,
  buildCoverageConversationContext,
  cloneDefaults,
  createOnboardingRecord,
  customerSetupQuestionnaireFromTurns,
  customerSetupRequiredPaths,
  normalizeOnboarding,
  normalizeCustomerSetupQuestionnaire,
  parseCustomerSetupQuestionnaireTurn,
  onboardingCompletion
};
