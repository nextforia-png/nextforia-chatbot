"use strict";

const assert = require("assert");
const {
  CUSTOMER_SETUP_QUESTIONS,
  buildCoverageConversationContext,
  cloneDefaults,
  createOnboardingRecord,
  normalizeCustomerSetupQuestionnaire,
  normalizeOnboarding,
  onboardingCompletion
} = require("./client-onboarding");

assert.strictEqual(onboardingCompletion(cloneDefaults()), 0);
assert.deepStrictEqual(
  CUSTOMER_SETUP_QUESTIONS.map(function (question) { return question.order; }),
  CUSTOMER_SETUP_QUESTIONS.map(function (question) { return question.order; }).slice().sort(function (a, b) { return a - b; })
);
assert.strictEqual(new Set(CUSTOMER_SETUP_QUESTIONS.map(function (question) { return question.id; })).size, CUSTOMER_SETUP_QUESTIONS.length);
assert(CUSTOMER_SETUP_QUESTIONS.every(function (question) { return question.active && question.path && question.type; }));

const normalized = normalizeOnboarding({
  setup_goal: "customer_service",
  business: { brand_name: "  Tienda Piloto  ", contact_email: "ADMIN@EXAMPLE.COM" },
  meta: { number_status: "invalid", whatsapp_integration_intent: "yes" },
  channels: { instagram: true, other: true, other_details: "Marketplace" },
  commerce: { platform: "other", other_platform: "Sistema propio", orders_required: false },
  confirmations: { owns_information: true }
});
assert.strictEqual(normalized.business.brand_name, "Tienda Piloto");
assert.strictEqual(normalized.business.contact_email, "admin@example.com");
assert.strictEqual(normalized.meta.number_status, "unknown");
assert.strictEqual(normalized.meta.whatsapp_integration_intent, "yes");
assert.strictEqual(normalized.meta.whatsapp_integration_status, "requested");
assert.strictEqual(normalized.channels.instagram, true);
assert.strictEqual(normalized.channels.other_details, "Marketplace");
assert.strictEqual(normalized.commerce.other_platform, "Sistema propio");
assert.strictEqual(normalized.commerce.orders_required, false);
assert.strictEqual(normalized.confirmations.owns_information, true);

const record = createOnboardingRecord(normalized, { tenant_id: "pilot-2", status: "submitted", updated_by: "Admin" });
assert.strictEqual(record.version, 2);
assert.strictEqual(record.tenant_id, "pilot-2");
assert.strictEqual(record.status, "submitted");
assert.ok(record.completion > 0 && record.completion < 100);
assert.strictEqual(record.setup_completed, false);
assert.strictEqual(record.setup_completed_at, null);
assert.ok(record.last_updated_at);

const completedAnswers = cloneDefaults();
completedAnswers.business.brand_name = "Empresa Completa";
completedAnswers.setup_goal = "customer_service";
completedAnswers.operations.primary_country = "Colombia";
completedAnswers.operations.primary_city = "Bogotá";
completedAnswers.operations.monthly_customer_volume = "300";
completedAnswers.business.contact_email = "admin@completa.example";
completedAnswers.business.contact_phone = "+57 300 000 0000";
completedAnswers.meta.whatsapp_number = "+57 300 000 0000";
completedAnswers.meta.whatsapp_integration_intent = "yes";
completedAnswers.operations.support_hours = "Lunes a viernes";
completedAnswers.customer_service_setup.business_offer_type = "products";
completedAnswers.customer_service_setup.business_offer_description = "Juguetes educativos y regalos";
completedAnswers.customer_service_setup.ideal_customer = "Familias que buscan regalos";
completedAnswers.customer_service_setup.value_proposition = "Curaduría y asesoría rápida";
completedAnswers.customer_service_setup.bot_display_name = "Nextfor de Empresa Completa";
completedAnswers.customer_service_setup.tone = "vendedor_dinamico";
completedAnswers.customer_service_setup.brand_restrictions = "No inventar precios ni descuentos";
completedAnswers.customer_service_setup.data_consent = true;
completedAnswers.operations.services_products = "Servicios";
completedAnswers.operations.frequent_questions = "Preguntas y respuestas";
completedAnswers.operations.important_policies = "Políticas";
completedAnswers.operations.bot_instructions = "Responder con claridad";
completedAnswers.team.admin_email = "admin@completa.example";
completedAnswers.team.human_support_contact = "Soporte +57 300 000 0000";
assert.strictEqual(onboardingCompletion(completedAnswers), 100);
const completedRecord = createOnboardingRecord(completedAnswers, { tenant_id: "completa", status: "completed" });
assert.strictEqual(completedRecord.setup_completed, true);
assert.strictEqual(completedRecord.answers.customer_service_setup.setup_status, "pending_review");
assert.ok(completedRecord.setup_completed_at);
const editedRecord = createOnboardingRecord(completedAnswers, { tenant_id: "completa", status: "draft", previous: completedRecord });
assert.strictEqual(editedRecord.setup_completed, true);
assert.strictEqual(editedRecord.setup_completed_at, completedRecord.setup_completed_at);

const customQuestionnaire = normalizeCustomerSetupQuestionnaire({
  questions: CUSTOMER_SETUP_QUESTIONS.concat([{
    id: "custom_como_medir_exito",
    label: "¿Cómo vamos a medir éxito?",
    section: "business",
    order: 85,
    type: "textarea",
    required: true,
    active: true
  }])
}, "Root", "2026-07-25T00:00:00.000Z");
const customQuestion = customQuestionnaire.questions.find(function (question) { return question.id === "custom_como_medir_exito"; });
assert.strictEqual(customQuestion.path, "custom.como_medir_exito");
assert.strictEqual(customQuestion.custom, true);
assert.strictEqual(customQuestionnaire.updated_by, "Root");
assert.ok(onboardingCompletion(completedAnswers, customQuestionnaire) < 100);
const completedWithCustom = cloneDefaults();
Object.assign(completedWithCustom, completedAnswers);
completedWithCustom.custom.como_medir_exito = "Retención, citas confirmadas y ventas recuperadas.";
assert.strictEqual(onboardingCompletion(completedWithCustom, customQuestionnaire), 100);

const appointmentAnswers = cloneDefaults();
appointmentAnswers.setup_goal = "appointments";
appointmentAnswers.appointment_setup.business_name = "Clínica Agenda";
appointmentAnswers.appointment_setup.business_category = "salud_bienestar";
appointmentAnswers.operations.monthly_customer_volume = "180";
appointmentAnswers.appointment_setup.target_customer = "Pacientes que quieren reservar consulta";
appointmentAnswers.appointment_setup.business_description = "Atención clara antes de confirmar cada cita";
appointmentAnswers.appointment_setup.assistant_tone = "calido_empatico";
appointmentAnswers.appointment_setup.bot_display_name = "Nextfor de Clínica Agenda";
appointmentAnswers.appointment_setup.allowed_topics = "Servicios, horarios y disponibilidad";
appointmentAnswers.appointment_setup.forbidden_topics = "Diagnósticos y promesas de resultado";
appointmentAnswers.appointment_setup.escalation_triggers = "Urgencias y quejas";
appointmentAnswers.appointment_setup.escalation_contact = "Recepción +57 300";
appointmentAnswers.appointment_setup.services = "Consulta inicial · 45 minutos";
appointmentAnswers.appointment_setup.business_hours = "Lunes a viernes";
appointmentAnswers.appointment_setup.staff_mode = "one";
appointmentAnswers.appointment_setup.appointment_locations = "Sede principal";
appointmentAnswers.appointment_setup.availability_rules = "Lunes a viernes de 8 a 5";
appointmentAnswers.appointment_setup.required_booking_fields = "Nombre, teléfono y servicio";
appointmentAnswers.appointment_setup.booking_confirmation_mode = "manual_approval";
appointmentAnswers.appointment_setup.cancellation_policy = "Cancelar mínimo 12 horas antes";
appointmentAnswers.appointment_setup.calendar_provider = "google";
appointmentAnswers.appointment_setup.reminder_channel = "whatsapp";
appointmentAnswers.appointment_setup.reminder_timing = "24h";
appointmentAnswers.appointment_setup.survey_enabled = "yes";
appointmentAnswers.appointment_setup.operational_channels = "WhatsApp";
appointmentAnswers.appointment_setup.data_consent = true;
assert.strictEqual(onboardingCompletion(appointmentAnswers), 100, "agendamiento no exige preguntas del ChatBot de atención");
const appointmentRecord = createOnboardingRecord(appointmentAnswers, { tenant_id: "clinica-agenda", status: "completed" });
assert.strictEqual(appointmentRecord.answers.setup_goal, "appointments");
assert.strictEqual(appointmentRecord.answers.appointment_setup.setup_status, "pending_review");
assert.strictEqual(appointmentRecord.setup_completed, true);

const bothAnswers = JSON.parse(JSON.stringify(completedAnswers));
bothAnswers.setup_goal = "both";
bothAnswers.appointment_setup = JSON.parse(JSON.stringify(appointmentAnswers.appointment_setup));
assert.strictEqual(onboardingCompletion(bothAnswers), 100, "ambos bots exige y acepta ambos bloques visibles");
const bothRecord = createOnboardingRecord(bothAnswers, { tenant_id: "ambos-bots", status: "completed" });
assert.strictEqual(bothRecord.answers.setup_goal, "both");
assert.strictEqual(bothRecord.answers.customer_service_setup.setup_status, "pending_review");
assert.strictEqual(bothRecord.answers.appointment_setup.setup_status, "pending_review");
assert.strictEqual(bothRecord.setup_completed, true);

const coverageAnswers = cloneDefaults();
coverageAnswers.operations.primary_country = "Colombia";
coverageAnswers.operations.countries_served = "Colombia y Panamá";
const coverageRecord = createOnboardingRecord(coverageAnswers, { tenant_id: "pilot-2", status: "submitted" });
assert.match(buildCoverageConversationContext(coverageRecord), /Países o territorios atendidos: Colombia y Panamá/);
assert.doesNotMatch(buildCoverageConversationContext(coverageRecord), /no parece colombiano/);

console.log("client onboarding tests passed");
