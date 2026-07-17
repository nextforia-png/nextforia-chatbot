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
  answers.automation.handoff_cases = "Reclamos, negociación o solicitud del cliente.";
  answers.outcomes.primary_goal = "Aumentar ventas atendidas desde redes.";
  answers.outcomes.success_metrics = "Ventas asistidas y tiempo de respuesta.";
  answers.industry_answers.catalog = "Catálogo web oficial.";
  return answers;
}

assert(INDUSTRY_PROFILES.commerce.questions.length >= 3, "commerce must have adaptive questions");
assert(INDUSTRY_PROFILES.health.questions.some(question => question.id === "safety"), "health must include safety boundaries");

const normalized = normalizeAnswers({
  business: { industry: "unknown", name: "  Negocio  " },
  voice: { formality: "invalid", emojis: "frecuentes" },
  channels: { instagram: true }
});
assert.strictEqual(normalized.business.industry, "other");
assert.strictEqual(normalized.business.name, "Negocio");
assert.strictEqual(normalized.voice.formality, "cercano");
assert.strictEqual(normalized.channels.instagram, true);

const answers = completeAnswers();
const completion = calculateCompletion(normalizeAnswers(answers));
assert(completion >= 80, "a useful setup should be ready to publish");

const derived = buildDerivedConfig(answers);
assert(derived.system_prompt.includes("RAV Toys"));
assert(derived.system_prompt.includes("fuente de verdad"));
assert(derived.system_prompt.includes("Catálogo web oficial"));
assert.deepStrictEqual(derived.enabled_channels, ["instagram", "messenger"]);

const record = createSetupRecord(answers, { tenant_id: "rav-toys", status: "published", updated_by: "Admin" });
assert.strictEqual(record.status, "published");
assert.strictEqual(record.tenant_id, "rav-toys");
assert(record.published_at);
assert(record.derived.completion >= 80);

console.log("bot-setup tests: ok");
