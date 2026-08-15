"use strict";

const assert = require("assert");
const {
  BOT_CONFIGURATION_CONTRACT,
  buildBotConfigurationPrompt,
  configurationForOnboarding,
  defaultsFromOnboarding,
  normalizeBotConfiguration,
  planFeatures
} = require("./bot-personality");

function configurationLeafPaths(value, prefix) {
  if (Array.isArray(value)) return [prefix];
  if (!value || typeof value !== "object") return [prefix];
  return Object.keys(value).reduce(function (paths, key) {
    return paths.concat(configurationLeafPaths(value[key], prefix ? prefix + "." + key : key));
  }, []);
}

const onboarding = {
  answers: {
    setup_goal: "customer_service",
    business: { brand_name: "RAV Toys" },
    operations: {
      support_hours: "Lunes a viernes 9 a 6",
      shipping: "Cobertura nacional; algunas zonas requieren cotización.",
      frequent_questions: "¿Hacen envíos? Sí, a toda Colombia.",
      payments: "Nequi y transferencia",
      bot_instructions: "No prometas inventario."
    },
    team: { human_support_contact: "ventas@ravtoys.com" },
    customer_service_setup: {
      bot_display_name: "RAV-Bot",
      tone: "cercano_profesional"
    }
  }
};

assert.deepStrictEqual(planFeatures("nextfor-uno"), {
  plan: "uno",
  shipping: false,
  catalog: false,
  payments: false,
  reminders: false
});
assert.strictEqual(planFeatures("nextfor-atlas").catalog, true);
assert.strictEqual(planFeatures("nextfor-tempo").reminders, true);

const defaults = defaultsFromOnboarding(onboarding, "nextfor-aura");
assert.strictEqual(defaults.response_length, "muy_breve");
assert.strictEqual(defaults.profile.display_name, "RAV-Bot");
assert.ok(defaults.greeting.text.includes("RAV Toys"));
assert.strictEqual(defaults.faqs.length, 1);
assert.strictEqual(defaults.shipping.pricing_mode, "quote");
assert.strictEqual(defaults.shipping.policy, "Cobertura nacional; algunas zonas requieren cotización.");

const normalized = normalizeBotConfiguration({
  response_length: "invalid",
  profile: { display_name: " Aura " },
  shipping: {
    fields: [{ id: "city", label: "Ciudad", required: true }, { id: "evil", label: "No permitido" }],
    pricing_mode: "flat",
    flat_fee_cop: 12900,
    free_over_cop: 200000,
    policy: "Aplica a cobertura nacional."
  },
  catalog: { price_mode: "human" },
  payments: { methods: ["card", "invalid", "card"] },
  faqs: [{ q: "¿Horario?", a: "De 9 a 6" }],
  extra_context: "x".repeat(6000)
}, { fallback: defaults, plan_id: "nextfor-aura", updated_by: "admin@example.com" });
assert.strictEqual(normalized.response_length, "muy_breve");
assert.strictEqual(normalized.profile.display_name, "Aura");
assert.deepStrictEqual(normalized.shipping.fields.map(function (row) { return row.id; }), ["city"]);
assert.strictEqual(normalized.shipping.pricing_mode, "flat");
assert.strictEqual(normalized.shipping.flat_fee_cop, 12900);
assert.deepStrictEqual(normalized.payments.methods, ["card"]);
assert.strictEqual(normalized.faqs[0].question, "¿Horario?");
assert.strictEqual(normalized.extra_context.length, 5000);
assert.strictEqual(normalized.updated_by, "admin@example.com");
const structuralPaths = configurationLeafPaths(normalizeBotConfiguration({}, {
  fallback: defaults,
  plan_id: "nextfor-atlas",
  updated_at: "2026-08-10T00:00:00.000Z",
  updated_by: "contract-test"
}), "").filter(function (path) {
  return !["version", "plan_id", "updated_at", "updated_by"].includes(path);
}).sort();
assert.deepStrictEqual(
  structuralPaths,
  Object.keys(BOT_CONFIGURATION_CONTRACT).sort(),
  "todo campo presente o futuro debe declarar cómo controla el bot live"
);
const tinyImage = "data:image/png;base64,iVBORw0KGgo=";
const withUploadedLogo = normalizeBotConfiguration({
  profile: { avatar_url: tinyImage }
}, { fallback: defaults, plan_id: "nextfor-aura" });
assert.strictEqual(withUploadedLogo.profile.avatar_url, tinyImage);
const withUnsafeLogo = normalizeBotConfiguration({
  profile: { avatar_url: "data:image/svg+xml;base64,PHN2Zz4=" }
}, { fallback: defaults, plan_id: "nextfor-aura" });
assert.strictEqual(withUnsafeLogo.profile.avatar_url, defaults.profile.avatar_url);

const stored = configurationForOnboarding(Object.assign({}, onboarding, {
  bot_personality: normalized
}), "nextfor-aura");
assert.strictEqual(stored.profile.display_name, "Aura");
assert.strictEqual(stored.plan_id, "aura");

const unoPrompt = buildBotConfigurationPrompt(normalized, { plan_id: "nextfor-uno" });
assert.ok(unoPrompt.includes("1 o 2 frases cortas"));
assert.ok(!unoPrompt.includes("DATOS DE ENVÍO"));
assert.ok(!unoPrompt.includes("Métodos de pago autorizados"));

const auraPrompt = buildBotConfigurationPrompt(normalized, { plan_id: "nextfor-aura" });
assert.ok(auraPrompt.includes("DATOS DE ENVÍO"));
assert.ok(auraPrompt.includes("Métodos de pago autorizados"));
assert.ok(auraPrompt.includes("RESPUESTAS EXACTAS"));
assert.ok(auraPrompt.includes("No prometas inventario"));

const contractPrompt = buildBotConfigurationPrompt({
  response_length: "detallada",
  emoji_level: "ninguno",
  profile: { display_name: "Asistente Contrato", description: "DESCRIPCION-CONTRATO" },
  greeting: { text: "SALUDO-CONTRATO" },
  business: {
    hours: "HORARIO-CONTRATO",
    address: "DIRECCION-CONTRATO",
    returns_policy: "DEVOLUCION-CONTRATO",
    out_of_hours_notice: true
  },
  shipping: {
    fields: [{ id: "city", label: "CIUDAD-CONTRATO", required: true }],
    pricing_mode: "flat",
    flat_fee_cop: 12900,
    free_over_cop: 200000,
    policy: "POLITICA-ENVIO-CONTRATO"
  },
  reminders: {
    type: "virtual",
    text: "RECORDATORIO-CONTRATO",
    timings: ["one_day", "one_hour"],
    allow_confirm_cancel: false
  },
  catalog: { price_mode: "human", out_of_stock_message: "AGOTADO-CONTRATO" },
  payments: { methods: ["card"], confirmation_message: "PAGO-CONTRATO" },
  faqs: [{ question: "PREGUNTA-CONTRATO", answer: "RESPUESTA-CONTRATO" }],
  escalation: { triggers: ["unknown_answer"], notify_contact: "CONTACTO-CONTRATO" },
  farewell: { text: "DESPEDIDA-CONTRATO" },
  preferred_words: "PREFERIDA-CONTRATO",
  avoided_words: "EVITADA-CONTRATO",
  custom_instructions: "INSTRUCCION-CONTRATO",
  extra_context: "CONTEXTO-CONTRATO"
}, { plan_id: "nextfor-atlas" });
assert(contractPrompt.includes("aplica inmediatamente, incluso a conversaciones abiertas"));
assert(contractPrompt.includes("reemplaza cualquier dato diferente o anterior del setup inicial"));
[
  "Puedes responder con más detalle",
  "No uses emojis",
  "Asistente Contrato",
  "DESCRIPCION-CONTRATO",
  "SALUDO-CONTRATO",
  "HORARIO-CONTRATO",
  "DIRECCION-CONTRATO",
  "DEVOLUCION-CONTRATO",
  "Fuera del horario humano",
  "CIUDAD-CONTRATO (obligatorio)",
  "$12.900 COP",
  "$200.000 COP",
  "POLITICA-ENVIO-CONTRATO",
  "cita virtual",
  "RECORDATORIO-CONTRATO",
  "un día antes, 1 hora antes",
  "No ofrezcas confirmación o cancelación automática",
  "no da precios",
  "AGOTADO-CONTRATO",
  "tarjeta",
  "PAGO-CONTRATO",
  "PREGUNTA-CONTRATO",
  "RESPUESTA-CONTRATO",
  "no conoces la respuesta",
  "CONTACTO-CONTRATO",
  "DESPEDIDA-CONTRATO",
  "PREFERIDA-CONTRATO",
  "EVITADA-CONTRATO",
  "INSTRUCCION-CONTRATO",
  "CONTEXTO-CONTRATO"
].forEach(function (fragment) {
  assert(contractPrompt.includes(fragment), "el control visible debe llegar al prompt activo: " + fragment);
});

console.log("bot-personality.test.js ok");
