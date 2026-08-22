"use strict";

const ROUTES = Object.freeze({
  CUSTOMER_SERVICE: "customer_service",
  APPOINTMENTS: "appointments",
  CLARIFY: "clarify"
});

const ROUTE_MARKERS = Object.freeze({
  customer_service: "atlas_route_customer_service",
  appointments: "atlas_route_appointments",
  clarify: "atlas_route_clarification"
});

const CLARIFICATION_QUESTION = "¿Necesitas ayuda con atención al cliente o quieres gestionar una cita?";
const PRIORITY_QUESTION = "¿Qué resolvemos primero: tu cita o tu consulta de atención al cliente?";

const APPOINTMENT_PATTERNS = [
  /\b(?:cita|citas|appointment|appointments|booking|reservas?)\b/i,
  /\b(?:agend(?:a|ar|amiento|o|é)|program(?:ar|ación)|reprogram(?:ar|ación)|calendarizar)\b/i,
  /\b(?:cancelar|cambiar|mover|confirmar)\b.{0,36}\b(?:cita|reserva|turno)\b/i,
  /\b(?:disponibilidad|horarios? disponibles?|cupos?)\b.{0,48}\b(?:consulta|servicio|cita|reserva|turno)?\b/i,
  /\b(?:consulta|valoración|sesión)\b.{0,32}\b(?:médica|médico|clínica|terapia|servicio)\b/i,
  /\b(?:demostración|demostracion|asesoría inicial|asesoria inicial|reunión comercial|reunion comercial|sesión de configuración|sesion de configuracion|reunión de seguimiento|reunion de seguimiento)\b/i
];

const CUSTOMER_SERVICE_PATTERNS = [
  /\b(?:producto|productos|catálogo|catalogo|precio|precios|cotiz(?:ar|ación)|compr(?:a|ar|é)|carrito)\b/i,
  /\b(?:pedido|pedidos|orden|órdenes|envío|envios|entrega|despacho|rastreo|guía|guia)\b/i,
  /\b(?:pago|pagos|factura|garantía|garantia|devolución|devolucion|reclamo)\b/i,
  /\b(?:cambio|cambiar)\b.{0,24}\b(?:producto|talla|pedido|compra)\b/i,
  /\b(?:soporte|servicio al cliente|atención al cliente|atencion al cliente|humano)\b/i,
  /\b(?:hablar|comunicarme|contactar|pasar|comunicar)\b.{0,24}\b(?:con\s+)?(?:un\s+|una\s+)?asesor(?:a)?\b/i,
  /\b(?:stock|inventario|tienda|sucursal|local)\b/i
];

function normalizedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function matchesAny(patterns, value) {
  return patterns.some(function (pattern) { return pattern.test(value); });
}

function detectAtlasIntent(message) {
  const text = normalizedText(message);
  const appointments = matchesAny(APPOINTMENT_PATTERNS, text);
  const customerService = matchesAny(CUSTOMER_SERVICE_PATTERNS, text);
  if (appointments && customerService) return { intent: ROUTES.CLARIFY, reason: "mixed_explicit_intents" };
  if (appointments) return { intent: ROUTES.APPOINTMENTS, reason: "explicit_appointment_intent" };
  if (customerService) return { intent: ROUTES.CUSTOMER_SERVICE, reason: "explicit_customer_service_intent" };
  return { intent: null, reason: "unclear_intent" };
}

function coordinateAtlasTurn(message, state) {
  state = state || {};
  const detected = detectAtlasIntent(message);
  if (detected.intent === ROUTES.CLARIFY) {
    return {
      route: ROUTES.CLARIFY,
      active_route: null,
      reason: detected.reason,
      reply: PRIORITY_QUESTION,
      marker: ROUTE_MARKERS.clarify
    };
  }
  if (detected.intent) {
    return {
      route: detected.intent,
      active_route: detected.intent,
      reason: detected.reason,
      switched: !!state.active_route && state.active_route !== detected.intent,
      reply: null,
      marker: ROUTE_MARKERS[detected.intent]
    };
  }
  if ([ROUTES.CUSTOMER_SERVICE, ROUTES.APPOINTMENTS].includes(state.active_route)) {
    return {
      route: state.active_route,
      active_route: state.active_route,
      reason: "continue_active_route",
      switched: false,
      reply: null,
      marker: ROUTE_MARKERS[state.active_route]
    };
  }
  return {
    route: ROUTES.CLARIFY,
    active_route: null,
    reason: detected.reason,
    reply: CLARIFICATION_QUESTION,
    marker: ROUTE_MARKERS.clarify
  };
}

function botCapabilitiesForRoute(route) {
  return {
    customer_service: route === ROUTES.CUSTOMER_SERVICE,
    appointments: route === ROUTES.APPOINTMENTS
  };
}

function routeStateFromTurns(turns, options) {
  options = options || {};
  const now = Number(options.now) || Date.now();
  const ttlMs = Math.max(1, Number(options.ttl_ms) || 6 * 60 * 60 * 1000);
  const ordered = (turns || []).slice().sort(function (a, b) {
    return new Date(b && (b.ts || b.created_at) || 0) - new Date(a && (a.ts || a.created_at) || 0);
  });
  for (const turn of ordered) {
    const updatedAt = Date.parse(turn && (turn.ts || turn.created_at) || "");
    if (!Number.isFinite(updatedAt) || now - updatedAt > ttlMs) continue;
    const tools = Array.isArray(turn && turn.tools) ? turn.tools : [];
    if (tools.includes(ROUTE_MARKERS.clarify)) {
      return { active_route: null, awaiting_clarification: true, updated_at: updatedAt };
    }
    if (tools.includes(ROUTE_MARKERS.appointments)) {
      return { active_route: ROUTES.APPOINTMENTS, awaiting_clarification: false, updated_at: updatedAt };
    }
    if (tools.includes(ROUTE_MARKERS.customer_service)) {
      return { active_route: ROUTES.CUSTOMER_SERVICE, awaiting_clarification: false, updated_at: updatedAt };
    }
  }
  return { active_route: null, awaiting_clarification: false, updated_at: 0 };
}

module.exports = {
  CLARIFICATION_QUESTION,
  PRIORITY_QUESTION,
  ROUTES,
  ROUTE_MARKERS,
  botCapabilitiesForRoute,
  coordinateAtlasTurn,
  detectAtlasIntent,
  routeStateFromTurns
};
