"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  CLARIFICATION_QUESTION,
  PRIORITY_QUESTION,
  ROUTES,
  ROUTE_MARKERS,
  botCapabilitiesForRoute,
  coordinateAtlasTurn,
  detectAtlasIntent,
  routeStateFromTurns
} = require("./atlas-coordinator");

assert.strictEqual(detectAtlasIntent("Quiero agendar una cita para mañana").intent, ROUTES.APPOINTMENTS);
assert.strictEqual(detectAtlasIntent("Necesito cambiar mi cita").intent, ROUTES.APPOINTMENTS);
assert.strictEqual(detectAtlasIntent("Asesoría inicial").intent, ROUTES.APPOINTMENTS);
assert.strictEqual(detectAtlasIntent("Quiero una reunión comercial").intent, ROUTES.APPOINTMENTS);
assert.strictEqual(detectAtlasIntent("¿Dónde está mi pedido?").intent, ROUTES.CUSTOMER_SERVICE);
assert.strictEqual(detectAtlasIntent("Quiero hablar con un asesor").intent, ROUTES.CUSTOMER_SERVICE);
assert.strictEqual(detectAtlasIntent("Hola, necesito ayuda").intent, null);
assert.strictEqual(
  detectAtlasIntent("Quiero cambiar mi cita y revisar el estado de mi pedido").intent,
  ROUTES.CLARIFY
);

let turn = coordinateAtlasTurn("Hola", {});
assert.strictEqual(turn.route, ROUTES.CLARIFY);
assert.strictEqual(turn.reply, CLARIFICATION_QUESTION);

turn = coordinateAtlasTurn("Quiero una cita", {});
assert.strictEqual(turn.route, ROUTES.APPOINTMENTS);
assert.strictEqual(turn.marker, ROUTE_MARKERS.appointments);
assert.strictEqual(turn.reply, null);

turn = coordinateAtlasTurn("Sí, mañana en la tarde", { active_route: ROUTES.APPOINTMENTS });
assert.strictEqual(turn.route, ROUTES.APPOINTMENTS, "an ambiguous follow-up must remain with Appointment");
assert.strictEqual(turn.reason, "continue_active_route");

turn = coordinateAtlasTurn("Asesoría inicial", { active_route: ROUTES.APPOINTMENTS });
assert.strictEqual(turn.route, ROUTES.APPOINTMENTS, "an appointment service name must not switch to Customer Service");

let tempoState = {};
[
  "Hola, quiero programar una cita de prueba para Nextfor",
  "Asesoría inicial",
  "Santiago Consultorio Médico, lunes a las 8:00am",
  "Videollamada"
].forEach(function (message) {
  const decision = coordinateAtlasTurn(message, tempoState);
  assert.strictEqual(decision.route, ROUTES.APPOINTMENTS, "the real Tempo flow must stay in Appointment for: " + message);
  tempoState = { active_route: decision.active_route };
});

turn = coordinateAtlasTurn("Ahora quiero saber dónde va mi pedido", { active_route: ROUTES.APPOINTMENTS });
assert.strictEqual(turn.route, ROUTES.CUSTOMER_SERVICE, "an explicit new need must switch bots");
assert.strictEqual(turn.switched, true);

turn = coordinateAtlasTurn("También cambia mi cita y dime el precio del producto", { active_route: ROUTES.CUSTOMER_SERVICE });
assert.strictEqual(turn.route, ROUTES.CLARIFY);
assert.strictEqual(turn.reply, PRIORITY_QUESTION);

assert.deepStrictEqual(botCapabilitiesForRoute(ROUTES.CUSTOMER_SERVICE), {
  customer_service: true,
  appointments: false
});
assert.deepStrictEqual(botCapabilitiesForRoute(ROUTES.APPOINTMENTS), {
  customer_service: false,
  appointments: true
});
assert.deepStrictEqual(botCapabilitiesForRoute(ROUTES.CLARIFY), {
  customer_service: false,
  appointments: false
});

const now = Date.now();
let state = routeStateFromTurns([
  { ts: new Date(now - 1000).toISOString(), tools: [ROUTE_MARKERS.appointments] },
  { ts: new Date(now - 2000).toISOString(), tools: [ROUTE_MARKERS.customer_service] }
], { now, ttl_ms: 60000 });
assert.strictEqual(state.active_route, ROUTES.APPOINTMENTS);

state = routeStateFromTurns([
  { ts: new Date(now - 1000).toISOString(), tools: [ROUTE_MARKERS.clarify] },
  { ts: new Date(now - 2000).toISOString(), tools: [ROUTE_MARKERS.customer_service] }
], { now, ttl_ms: 60000 });
assert.strictEqual(state.active_route, null);
assert.strictEqual(state.awaiting_clarification, true);

state = routeStateFromTurns([
  { ts: new Date(now - 120000).toISOString(), tools: [ROUTE_MARKERS.appointments] }
], { now, ttl_ms: 60000 });
assert.strictEqual(state.active_route, null, "expired routing state must not leak into a new session");

const applicationSource = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
assert(applicationSource.includes("const isAtlasConversation = usesCustomerServiceBot && usesAppointmentBot"));
assert(applicationSource.includes("let routeUsesCustomerServiceBot = usesCustomerServiceBot"), "single Customer Service customers must keep their current path");
assert(applicationSource.includes("let routeUsesAppointmentBot = usesAppointmentBot"), "single Appointment customers must keep their current path");
assert(applicationSource.includes("customer_service_prompt: routeUsesCustomerServiceBot"));
assert(applicationSource.includes("appointment_prompt: routeUsesAppointmentBot"));
assert(applicationSource.includes("if (routeUsesAppointmentBot)"));
assert(!applicationSource.includes("if (usesAppointmentBot) {\n    APPOINTMENT_TOOLS"), "Atlas must not expose Appointment tools to Customer Service turns");
assert(
  applicationSource.indexOf("if (atlasDecision.route === ATLAS_ROUTES.CLARIFY)") <
    applicationSource.indexOf("const runtimePolicy = resolveTenantRuntimePolicy"),
  "unclear Atlas messages must return one clarification before either bot is invoked"
);

console.log("atlas-coordinator.test.js ok");
