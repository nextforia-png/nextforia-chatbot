"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
const start = source.indexOf("function compactAppointmentPresentationText");
const end = source.indexOf("async function searchShopifyStorefront", start);
assert(start >= 0 && end > start, "appointment presentation helpers must exist in the runtime");

const loadHelpers = new Function("appointmentSettingsFromOnboarding", [
  source.slice(start, end),
  "return {",
  "  buildAppointmentServicesRulesOverview,",
  "  appointmentServicesRulesRequested,",
  "  appointmentServicesRulesAlreadyPresented,",
  "  buildAppointmentServicesRulesContext,",
  "  ensureAppointmentServicesRulesPresentation",
  "};"
].join("\n"));

const helpers = loadHelpers(function (record) {
  const setup = record && record.answers && record.answers.appointment_setup || {};
  return { scheduling_rules: setup.scheduling_rules || [] };
});

const tenantA = {
  answers: {
    appointment_setup: {
      services: "Valoración inicial\nConsulta de seguimiento",
      scheduling_rules: [{ text: "Atendemos de lunes a viernes.", active: true }],
      minimum_booking_notice: "12 horas antes",
      cancellation_policy: "Reprograma con 6 horas de anticipación."
    }
  },
  appointment_configuration: {}
};
const tenantB = {
  answers: {
    appointment_setup: {
      services: "Sesión de fotografía",
      scheduling_rules: [{ text: "Solo sábados.", active: true }]
    }
  },
  appointment_configuration: {}
};

const overviewA = helpers.buildAppointmentServicesRulesOverview(tenantA);
const overviewB = helpers.buildAppointmentServicesRulesOverview(tenantB);
assert(overviewA.includes("*Servicios disponibles*"));
assert(overviewA.includes("Valoración inicial · Consulta de seguimiento"));
assert(overviewA.includes("*Reglas de la cita*"));
assert(overviewA.includes("Reprograma con 6 horas de anticipación."));
assert(!overviewA.includes("Sesión de fotografía"), "tenant A must not show tenant B services");
assert(overviewB.includes("Sesión de fotografía"));
assert(!overviewB.includes("Valoración inicial"), "tenant B must not show tenant A services");

assert.strictEqual(helpers.appointmentServicesRulesRequested("Quiero agendar una cita el lunes"), true);
assert.strictEqual(helpers.appointmentServicesRulesRequested("Hola, ¿cómo están?"), false);
assert.strictEqual(helpers.appointmentServicesRulesAlreadyPresented([], overviewA), false);

const reply = helpers.ensureAppointmentServicesRulesPresentation("Claro.\n¿Cuál servicio deseas?", overviewA);
assert(reply.startsWith(overviewA), "the exact tenant overview must lead the first booking reply");
assert(reply.includes("Claro.\n¿Cuál servicio deseas?"), "the natural reply must keep its line breaks");
assert.strictEqual(helpers.appointmentServicesRulesAlreadyPresented([
  { role: "assistant", content: reply }
], overviewA), true, "the overview must not be repeated in the same conversation");
assert(helpers.buildAppointmentServicesRulesContext(overviewA).includes("No lo repitas"));

const updatedA = JSON.parse(JSON.stringify(tenantA));
updatedA.appointment_configuration = { services: "Diagnóstico personalizado" };
const updatedOverview = helpers.buildAppointmentServicesRulesOverview(updatedA);
assert(updatedOverview.includes("Diagnóstico personalizado"), "the latest Configuration value must replace the setup value");
assert(!updatedOverview.includes("Valoración inicial"), "stale setup services must not leak after a Configuration update");

console.log("appointment-services-rules.test.js ok");
