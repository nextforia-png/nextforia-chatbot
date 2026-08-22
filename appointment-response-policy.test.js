"use strict";

const assert = require("assert");
const {
  appointmentReplyRepairMessage,
  spanishCalendarContradictions,
  validateAppointmentReply
} = require("./appointment-response-policy");

let result = validateAppointmentReply(
  "Perfecto, te agendo para el lunes 10 de febrero a las 8:00 a. m.",
  [],
  { currentYear: 2026 }
);
assert.strictEqual(result.ok, false);
assert.strictEqual(result.reason, "calendar_weekday_mismatch");
assert.strictEqual(result.requiredTool, "check_appointment_availability");

result = validateAppointmentReply(
  "Perfecto, te agendo para el lunes 24 de agosto de 2026 a las 8:00 a. m.",
  [],
  { currentYear: 2026 }
);
assert.strictEqual(result.reason, "booking_claim_without_booking_tool");
assert.strictEqual(result.requiredTool, "book_appointment");

result = validateAppointmentReply("Ese horario está disponible.", []);
assert.strictEqual(result.ok, false);
assert.strictEqual(result.requiredTool, "check_appointment_availability");

assert.strictEqual(validateAppointmentReply("Ese horario está disponible.", ["check_appointment_availability"]).ok, true);
assert.strictEqual(validateAppointmentReply("Tu cita quedó confirmada.", ["book_appointment"]).ok, true);
assert.match(appointmentReplyRepairMessage(result), /Conserva todos los datos/);

assert.deepStrictEqual(
  spanishCalendarContradictions("Te agendo para el lunes 10 de febrero.", { currentYear: 2026 }),
  ["lunes 10 de febrero"]
);
assert.deepStrictEqual(
  spanishCalendarContradictions("Te agendo para el lunes 24 de agosto de 2026.", { currentYear: 2026 }),
  []
);
result = validateAppointmentReply("El viernes 14 de agosto de 2025 está disponible.", ["check_appointment_availability"], { currentYear: 2026 });
assert.strictEqual(result.reason, "calendar_weekday_mismatch", "a tool marker must never allow a contradictory calendar statement");

console.log("appointment-response-policy.test.js ok");
