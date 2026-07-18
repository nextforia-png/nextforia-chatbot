const assert = require("assert");
const {
  INDUSTRY_PROFILES,
  copyDefaults,
  normalizeAnswers,
  calculateCompletion,
  buildDerivedConfig,
  createSetupRecord
} = require("./bot-setup");

function completeAnswers() {
  const answers = copyDefaults();
  answers.business.description = "Juguetería con atención en línea y tienda física.";
  answers.business.audience = "Familias que buscan regalos para niños.";
  answers.presence.locations = "El Tesoro, Medellín.";
  answers.presence.hours = "Lunes a sábado de 10 a 19.";
  answers.service.main_offering = "Juguetes y regalos.";
  answers.service.conditions = "Garantía por defectos de fábrica.";
  answers.automation.can_answer = "Productos, horarios y envíos.";
  answers.automation.must_not_answer = "Descuentos especiales ni datos privados.";
  answers.automation.handoff_cases = "Reclamos, negociación o solicitud del cliente.";
  answers.outcomes.primary_goal = "Aumentar ventas atendidas desde redes.";
  answers.outcomes.success_metrics = "Ventas asistidas y tiempo de respuesta.";
  answers.industry_answers.catalog = "Catálogo web oficial.";
  return answers;
}

assert(INDUSTRY_PROFILES.commerce.questions.length >= 3, "commerce must have adaptive questions");
assert(INDUSTRY_PROFILES.health.questions.some(question => question.id === "safety"), "health must include safety boundaries");

const normalized = normalizeAnswers({
  business: { industry: "unknown", name: "  Negocio  ", web_platform: "shopify" },
  voice: { formality: "invalid", emojis: "frecuentes" },
  channels: { instagram: true, instagram_handle: " @negocio " }
});
assert.strictEqual(normalized.business.industry, "other");
assert.strictEqual(normalized.business.name, "Negocio");
assert.strictEqual(normalized.business.web_platform, "shopify");
assert.strictEqual(normalized.voice.formality, "cercano");
assert.strictEqual(normalized.channels.instagram, true);
assert.strictEqual(normalized.channels.instagram_handle, "@negocio");
assert.strictEqual(normalized.presence.service_country_code, "CO");
assert.strictEqual(normalized.presence.service_country_name, "Colombia");
assert.strictEqual(normalized.presence.foreign_number_check_enabled, true);
assert.strictEqual(normalized.retargeting.mode, "disabled");
assert.strictEqual(normalized.retargeting.require_marketing_opt_in, true);

const retargeting = normalizeAnswers({
  retargeting: {
    mode: "simulation",
    high_intent_delay_hours: 0,
    abandoned_cart_delay_hours: 900,
    post_purchase_delay_days: "5",
    max_marketing_messages_7d: 20,
    send_window_start: "08:30",
    send_window_end: "bad",
    require_marketing_opt_in: false,
    stop_on_opt_out: false
  }
}).retargeting;
assert.strictEqual(retargeting.mode, "simulation");
assert.strictEqual(retargeting.high_intent_delay_hours, 1);
assert.strictEqual(retargeting.abandoned_cart_delay_hours, 168);
assert.strictEqual(retargeting.post_purchase_delay_days, 5);
assert.strictEqual(retargeting.max_marketing_messages_7d, 2);
assert.strictEqual(retargeting.send_window_start, "09:00");
assert.strictEqual(retargeting.send_window_end, "19:00");
assert.strictEqual(retargeting.require_marketing_opt_in, true);
assert.strictEqual(retargeting.stop_on_opt_out, true);

const answers = completeAnswers();
answers.business.web_platform = "shopify";
answers.channels.instagram_handle = "@ravtoys";
const completion = calculateCompletion(normalizeAnswers(answers));
assert(completion >= 80, "a useful setup should be ready to publish");

const derived = buildDerivedConfig(answers);
assert(derived.system_prompt.includes("RAV Toys"));
assert(derived.system_prompt.includes("fuente de verdad"));
assert(derived.system_prompt.includes("Catálogo web oficial"));
assert(derived.system_prompt.includes("shopify"));
assert(derived.system_prompt.includes("@ravtoys"));
assert.deepStrictEqual(derived.enabled_channels, ["instagram", "messenger"]);
assert.strictEqual(derived.retargeting.mode, "disabled");
assert.strictEqual(derived.service_area.country_code, "CO");
assert.strictEqual(derived.service_area.foreign_number_check_enabled, true);
assert(derived.system_prompt.includes("País o mercado atendido: Colombia"));

const record = createSetupRecord(answers, { tenant_id: "rav-toys", status: "published", updated_by: "Admin" });
assert.strictEqual(record.status, "published");
assert.strictEqual(record.tenant_id, "rav-toys");
assert(record.published_at);
assert(record.derived.completion >= 80);

console.log("bot-setup tests: ok");
