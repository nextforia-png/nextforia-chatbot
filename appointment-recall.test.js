"use strict";

const assert = require("assert");
const {
  appointmentsForConversation,
  buildAppointmentRecallContext,
  buildAppointmentRecallReply,
  classifyAppointmentRecallIntent,
  validMeetingLink
} = require("./appointment-recall");

const rows = [
  {
    tenant_id: "tenant-a",
    appointment_id: "appt-a",
    customer_conversation_id: "573013507371",
    customer_phone: "+573013507371",
    status: "booked",
    starts_at: "2026-08-24T13:00:00.000Z",
    appointment_service_name: "Demostración de Nextfor",
    calendar_event_link: "https://calendar.google.com/calendar/event?eid=private-management-link"
  },
  {
    tenant_id: "tenant-b",
    appointment_id: "appt-b",
    customer_conversation_id: "573013507371",
    status: "booked",
    starts_at: "2026-08-25T13:00:00.000Z",
    appointment_service_name: "Cita de otro tenant"
  }
];

assert.strictEqual(classifyAppointmentRecallIntent("Me envías el link de la cita?"), "link");
assert.strictEqual(classifyAppointmentRecallIntent("¿Tengo una cita agendada contigo?"), "status");
assert.strictEqual(classifyAppointmentRecallIntent("Quiero agendar una cita"), "", "a new booking request must not be intercepted");

const tenantAAppointments = appointmentsForConversation(
  rows,
  "wa:+57 301 350 7371",
  { now: "2026-08-23T12:00:00.000Z", tenantId: "tenant-a" }
);
assert.deepStrictEqual(tenantAAppointments.map(function (row) { return row.appointment_id; }), ["appt-a"]);
assert.strictEqual(
  appointmentsForConversation(rows, "wa:573013507371", { tenantId: "tenant-c" }).length,
  0,
  "appointments must never leak across customer identities or tenants"
);

assert.strictEqual(validMeetingLink(rows[0]), "", "a calendar management URL is not a customer meeting link");
let reply = buildAppointmentRecallReply("link", tenantAAppointments, { timeZone: "America/Bogota" });
assert.match(reply, /Sí, tu cita está confirmada/);
assert.match(reply, /lunes, 24 de agosto de 2026.*8:00 a\.\s*m\./i);
assert.match(reply, /enlace de acceso aún no está registrado/i);
assert.doesNotMatch(reply, /calendar\.google/);

const withMeet = Object.assign({}, rows[0], { virtual_meeting_link: "https://meet.google.com/abc-defg-hij" });
reply = buildAppointmentRecallReply("link", [withMeet], { timeZone: "America/Bogota" });
assert.match(reply, /https:\/\/meet\.google\.com\/abc-defg-hij/);

const context = buildAppointmentRecallContext(tenantAAppointments, { timeZone: "America/Bogota" });
assert.match(context, /FUENTE AUTORITATIVA/);
assert.match(context, /enlace=pendiente/);
assert.doesNotMatch(context, /Cita de otro tenant/);

console.log("appointment-recall.test.js ok");
