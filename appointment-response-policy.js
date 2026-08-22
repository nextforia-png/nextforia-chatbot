"use strict";

function normalizedTools(tools) {
  return new Set((Array.isArray(tools) ? tools : []).map(function (tool) {
    return String(tool || "").trim();
  }).filter(Boolean));
}

const SPANISH_MONTHS = Object.freeze({
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11
});

const SPANISH_WEEKDAYS = Object.freeze({
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6
});

function validCalendarDay(year, month, day) {
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
    ? date.getUTCDay()
    : null;
}

function spanishCalendarContradictions(reply, options) {
  const text = String(reply || "");
  const now = new Date(options && options.now || Date.now());
  const currentYear = Number(options && options.currentYear) || now.getUTCFullYear();
  const pattern = /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+(?:el\s+)?(\d{1,2})(?:\s+de)?\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?/gi;
  const conflicts = [];
  let match;
  while ((match = pattern.exec(text))) {
    const weekday = SPANISH_WEEKDAYS[match[1].toLowerCase()];
    const month = SPANISH_MONTHS[match[3].toLowerCase()];
    const day = Number(match[2]);
    const explicitYear = Number(match[4]) || 0;
    const years = explicitYear ? [explicitYear] : [currentYear, currentYear + 1];
    const matchesWeekday = years.some(function (year) {
      return validCalendarDay(year, month, day) === weekday;
    });
    if (!matchesWeekday) conflicts.push(match[0]);
  }
  return conflicts;
}

function claimsCompletedBooking(reply) {
  const text = String(reply || "");
  return /\b(?:cita|reserva|reunión|reunion|turno)\b.{0,100}\b(?:confirmad[ao]|agendad[ao]|reservad[ao]|programad[ao])\b/i.test(text) ||
    /\b(?:te\s+)?(?:agendo|reservé|reserve|programé|programe)\b/i.test(text) ||
    /\b(?:he|hemos|ya)\s+(?:agendado|reservado|programado)\b/i.test(text);
}

function claimsAvailability(reply) {
  const text = String(reply || "");
  return /\b(?:está|esta|hay|veo)\b.{0,90}\bdisponible\b/i.test(text) ||
    /\b(?:horario|espacio|cupo)\b.{0,70}\bdisponible\b/i.test(text);
}

function validateAppointmentReply(reply, tools, options) {
  const used = normalizedTools(tools);
  const calendarConflicts = spanishCalendarContradictions(reply, options);
  if (calendarConflicts.length) {
    return {
      ok: false,
      reason: "calendar_weekday_mismatch",
      requiredTool: "check_appointment_availability",
      instruction: "La fecha y el día de la semana de tu borrador no coinciden. Usa el contexto temporal actual y repite exactamente la fecha normalizada por check_appointment_availability.",
      conflicts: calendarConflicts
    };
  }
  if (claimsCompletedBooking(reply) && !used.has("book_appointment")) {
    return {
      ok: false,
      reason: "booking_claim_without_booking_tool",
      requiredTool: "book_appointment",
      instruction: "No afirmes que la cita está agendada. Usa book_appointment y confirma solo si devuelve status=booked y calendar_sync_status=synced."
    };
  }
  if (claimsAvailability(reply) && !used.has("check_appointment_availability") && !used.has("book_appointment")) {
    return {
      ok: false,
      reason: "availability_claim_without_calendar_tool",
      requiredTool: "check_appointment_availability",
      instruction: "No afirmes disponibilidad sin consultar el calendario. Usa check_appointment_availability con la fecha y hora reunidas en la conversación."
    };
  }
  return { ok: true, reason: "ok", requiredTool: "", instruction: "" };
}

function appointmentReplyRepairMessage(validation) {
  return [
    "[VALIDACIÓN INTERNA DE NEXTFOR — NO MOSTRAR AL CLIENTE]",
    validation && validation.instruction || "Corrige la respuesta usando las herramientas de citas.",
    "Conserva todos los datos que el cliente ya dio, incluida la hora. No vuelvas a pedirlos.",
    "Genera ahora la respuesta correcta y breve."
  ].join("\n");
}

module.exports = {
  appointmentReplyRepairMessage,
  claimsAvailability,
  claimsCompletedBooking,
  spanishCalendarContradictions,
  validateAppointmentReply
};
