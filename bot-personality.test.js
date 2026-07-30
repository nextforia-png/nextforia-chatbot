"use strict";

const assert = require("assert");
const {
  buildBotConfigurationPrompt,
  configurationForOnboarding,
  defaultsFromOnboarding,
  normalizeBotConfiguration,
  planFeatures
} = require("./bot-personality");

const onboarding = {
  answers: {
    setup_goal: "customer_service",
    business: { brand_name: "RAV Toys" },
    operations: {
      support_hours: "Lunes a viernes 9 a 6",
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

const normalized = normalizeBotConfiguration({
  response_length: "invalid",
  profile: { display_name: " Aura " },
  shipping: {
    fields: [{ id: "city", label: "Ciudad", required: true }, { id: "evil", label: "No permitido" }]
  },
  catalog: { price_mode: "human" },
  payments: { methods: ["card", "invalid", "card"] },
  faqs: [{ q: "¿Horario?", a: "De 9 a 6" }],
  extra_context: "x".repeat(6000)
}, { fallback: defaults, plan_id: "nextfor-aura", updated_by: "admin@example.com" });
assert.strictEqual(normalized.response_length, "muy_breve");
assert.strictEqual(normalized.profile.display_name, "Aura");
assert.deepStrictEqual(normalized.shipping.fields.map(function (row) { return row.id; }), ["city"]);
assert.deepStrictEqual(normalized.payments.methods, ["card"]);
assert.strictEqual(normalized.faqs[0].question, "¿Horario?");
assert.strictEqual(normalized.extra_context.length, 5000);
assert.strictEqual(normalized.updated_by, "admin@example.com");

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

console.log("bot-personality.test.js ok");
