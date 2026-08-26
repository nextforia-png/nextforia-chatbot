"use strict";

const assert = require("assert");
const vm = require("vm");
const renderClientOnboarding = require("./client-onboarding-page");

let html = "";
const res = {
  status: function () { return res; },
  setHeader: function () { return res; },
  send: function (value) {
    html = value;
    return res;
  }
};
renderClientOnboarding(res, {
  tenant: { id: "tenant-render-test", name: "Tenant Render Test" },
  adminEmail: "admin@example.com",
  record: {
    status: "draft",
    completion: 0,
    setup_completed: false,
    answers: { setup_goal: "customer_service" }
  },
  returnPath: "/admin/panel?tab=notifications",
  questionnaire: {
    questions: [{
      id: "new_real_setup_question",
      path: "customer_service_setup.new_training_rule",
      section: "business",
      order: 999,
      active: true,
      required: false,
      type: "textarea",
      label: "Nueva pregunta real"
    }]
  }
});

assert.match(html, /function renderDynamicQuestions\(\)/);
assert.match(html, /createQuestionField\(question\)/);
assert.match(html, /question\.path!=="setup_goal"&&!isSharedBusinessHoursPath\(question\.path\)&&questionApplies\(question\)/);
assert.match(html, /document\.querySelector\(fieldSelector\(question\.path\)\)/);
assert.match(html, /customer_service_setup\.new_training_rule/);
assert.match(html, /data-field="appointment_setup\.calls_enabled"/);
assert.match(html, /Sí, activar llamadas/);
assert.match(html, /El número aparecerá en tu Customer Panel listo para compartir/);
assert.match(html, /Nextfor asignará el número automáticamente/);
assert.match(html, /class="returnLink" href="\/admin\/panel\?tab=notifications"/);
assert.match(html, /← Volver al Panel de Control/);
assert.match(html, /function prepareOnboardingExternalTab\(label\)/);
assert.match(html, /window\.open\("about:blank","_blank"\)/);
assert.match(html, /navigateOnboardingExternalTab\(externalTab,shopifyConnectButton\.href\)/);
assert.doesNotMatch(html, /location\.href=shopifyConnectButton\.href/);
assert.match(html, /class="setupPage goalStepMode hidden" id="setupPage"/);
assert.match(html, /repeat\(auto-fit,minmax\(min\(100%,220px\),1fr\)\)/);
assert.match(html, /@media\(max-width:1020px\) and \(min-width:861px\)/);
assert.match(html, /startSetup"\)\.onclick=function\(\)\{[^}]*render\(\)/);
assert.match(html, /Horario de atención/);
assert.match(html, /\+ Agregar horario distinto/);
assert.match(html, /data-field="operations\.business_hours_schedule"/);
assert.match(html, /function syncBusinessHours\(answers\)/);
assert.match(html, /scheduleGroupsValid\(\)/);
assert.doesNotMatch(html, /Horario de atención humana/);
assert.doesNotMatch(html, /Horario disponible para apoyo humano/);
assert.doesNotMatch(html, /¿Cuál es el horario general de atención de tu negocio\?/);
assert.doesNotMatch(html, /¿Qué días y horarios puede ofrecer Nextfor\?/);
assert.strictEqual((html.match(/data-field="appointment_setup\.business_category"/g) || []).length, 1, "Appointment setup fields render once, even with the combined-bots journey");

const scheduleScriptStart = html.indexOf("function setPath");
const scheduleScriptEnd = html.indexOf("function esc", scheduleScriptStart);
assert.ok(scheduleScriptStart >= 0 && scheduleScriptEnd > scheduleScriptStart, "The grouped schedule helpers are included in the setup page");
const scheduleContext = {
  document: { querySelectorAll: function () { return []; } }
};
vm.runInNewContext(html.slice(scheduleScriptStart, scheduleScriptEnd), scheduleContext);
scheduleContext.scheduleGroups = [
  { days: ["lunes", "martes", "miercoles", "jueves", "viernes"], closed: false, start: "08:00", end: "18:00" },
  { days: ["sabado"], closed: false, start: "08:00", end: "14:00" },
  { days: ["domingo"], closed: true, start: "", end: "" }
];
scheduleContext.scheduleTouched = true;
const sharedScheduleAnswers = {};
scheduleContext.syncBusinessHours(sharedScheduleAnswers);
assert.match(sharedScheduleAnswers.operations.business_hours, /Lunes a viernes: 8:00 AM — 6:00 PM/);
assert.strictEqual(sharedScheduleAnswers.operations.support_hours, sharedScheduleAnswers.operations.business_hours);
assert.strictEqual(sharedScheduleAnswers.appointment_setup.human_support_hours, sharedScheduleAnswers.operations.business_hours);
assert.strictEqual(sharedScheduleAnswers.appointment_setup.business_hours, sharedScheduleAnswers.operations.business_hours);
assert.strictEqual(sharedScheduleAnswers.appointment_setup.availability_rules, sharedScheduleAnswers.operations.business_hours);
assert.match(sharedScheduleAnswers.operations.business_hours_schedule, /"sabado"/);

let partialCatalogHtml = "";
renderClientOnboarding({
  status: function () { return this; },
  setHeader: function () { return this; },
  send: function (value) { partialCatalogHtml = value; return this; }
}, {
  tenant: { id: "tenant-partial-catalog", name: "Catálogo parcial", plan_id: "nextfor-uno", assigned_bot_id: "atencion-cliente" },
  record: { status: "draft", completion: 0, setup_completed: false, answers: { setup_goal: "customer_service" } },
  plans: [{ id: "nextfor-uno", bot_id: "atencion-cliente", nombre: "Nextfor Uno", precio_mensual: 49900, activo: true }],
  bots: [{ id: "atencion-cliente", nombre: "Atención al cliente", activo: true }],
  questionnaire: { version: 1, questions: [] }
});
assert.match(partialCatalogHtml, /name="selected_plan" value="nextfor-uno"/);
assert.match(partialCatalogHtml, /name="selected_plan" value="nextfor-aura"/, "Aura remains selectable when the dynamic catalog is incomplete");
assert.match(partialCatalogHtml, /data-plan-bot="atencion-cliente"/);

console.log("client-onboarding-page.test.js: ok");
