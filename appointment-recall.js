"use strict";

const ACTIVE_APPOINTMENT_STATUSES = new Set(["booked", "requested", "rescheduled"]);

function cleanText(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max || 500);
}

function normalizedIdentity(value) {
  const raw = cleanText(value, 240).toLowerCase();
  const email = raw.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (email) return email[0].toLowerCase();
  return raw.replace(/^(?:wa|whatsapp):/i, "").replace(/\D/g, "");
}

function classifyAppointmentRecallIntent(message) {
  const text = cleanText(message, 2000).toLowerCase();
  if (!text) return "";
  const appointmentWord = /\b(?:cita|reserva|reuni[oó]n|turno)\b/i;
  const linkWord = /\b(?:link|enlace|meet|videollamada|acceso)\b/i;
  const linkRequest = linkWord.test(text) && (
    appointmentWord.test(text) ||
    /\b(?:env[ií]a(?:me)?|manda(?:me)?|comp[aá]rte(?:me)?|dame|necesito|cu[aá]l)\b/i.test(text)
  );
  if (linkRequest) return "link";
  if (!appointmentWord.test(text)) return "";
  if (/\b(?:quiero|quisiera|necesito|deseo|puedes|podr[ií]as|ay[uú]dame)\b.{0,45}\b(?:agendar|reservar|programar|sacar|pedir)\b/i.test(text)) return "";
  if (
    /\b(?:tengo|ten[ií]a|hay|existe|aparece|figura|registrad[ao]|confirmad[ao]|agendad[ao]|programad[ao])\b/i.test(text) ||
    /\b(?:cu[aá]ndo|qu[eé]\s+(?:cita|reserva)|fecha|hora|horario|estado|detalle|informaci[oó]n)\b/i.test(text) ||
    /\b(?:mi|la)\s+(?:cita|reserva|reuni[oó]n|turno)\b/i.test(text)
  ) return "status";
  return "";
}

function appointmentsForConversation(rows, conversationIdentity, options) {
  const now = new Date(options && options.now || Date.now()).getTime();
  const tenantId = cleanText(options && options.tenantId, 80);
  const pastGraceMs = Number(options && options.pastGraceMs) >= 0
    ? Number(options.pastGraceMs)
    : 24 * 60 * 60 * 1000;
  const identity = normalizedIdentity(conversationIdentity);
  if (!identity) return [];
  const matched = (Array.isArray(rows) ? rows : []).filter(function (row) {
    if (tenantId && cleanText(row && row.tenant_id, 80) !== tenantId) return false;
    if (!row || !ACTIVE_APPOINTMENT_STATUSES.has(cleanText(row.status, 40).toLowerCase())) return false;
    const startsAt = new Date(row.starts_at || "").getTime();
    if (Number.isFinite(startsAt) && startsAt < now - pastGraceMs) return false;
    const conversation = normalizedIdentity(row.customer_conversation_id);
    const phone = normalizedIdentity(row.customer_phone);
    const email = normalizedIdentity(row.customer_email);
    return identity === conversation || identity === phone || identity === email;
  });
  return matched.sort(function (left, right) {
    const leftTime = new Date(left.starts_at || 0).getTime();
    const rightTime = new Date(right.starts_at || 0).getTime();
    const leftUpcoming = Number.isFinite(leftTime) && leftTime >= now;
    const rightUpcoming = Number.isFinite(rightTime) && rightTime >= now;
    if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
    return leftUpcoming ? leftTime - rightTime : rightTime - leftTime;
  });
}

function validMeetingLink(row) {
  const candidates = [
    row && row.virtual_meeting_link,
    row && row.meeting_link,
    row && row.meeting_url,
    row && row.conference_link,
    row && row.join_url
  ];
  return candidates.map(function (value) { return cleanText(value, 1000); }).find(function (value) {
    if (!/^https:\/\//i.test(value)) return false;
    try {
      const url = new URL(value);
      return Boolean(url.hostname && !/calendar\.google\./i.test(url.hostname));
    } catch (_) {
      return false;
    }
  }) || "";
}

function appointmentWhen(value, timeZone) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "el horario registrado";
  try {
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: cleanText(timeZone, 100) || "America/Bogota",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(date);
  } catch (_) {
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(date);
  }
}

function buildAppointmentRecallReply(intent, appointments, options) {
  const rows = Array.isArray(appointments) ? appointments : [];
  if (!rows.length) return "";
  const appointment = rows[0];
  const confirmed = appointment.status === "booked" || appointment.status === "rescheduled";
  const status = confirmed ? "confirmada" : "registrada y pendiente de confirmación";
  const service = cleanText(appointment.appointment_service_name || appointment.consultation_reason, 180) || "Tu cita";
  const when = appointmentWhen(appointment.starts_at, options && options.timeZone);
  const link = validMeetingLink(appointment);
  const lines = [
    "Sí, tu cita está " + status + ":",
    "• " + service,
    "• " + when
  ];
  if (intent === "link") {
    if (link) lines.push("Enlace de acceso: " + link);
    else lines.push("El enlace de acceso aún no está registrado. Te lo enviaremos por este chat antes de la cita.");
  }
  return lines.join("\n");
}

function buildAppointmentRecallContext(appointments, options) {
  const rows = (Array.isArray(appointments) ? appointments : []).slice(0, 5);
  if (!rows.length) return "";
  const lines = [
    "CITAS PERSISTENTES DEL CLIENTE (FUENTE AUTORITATIVA):",
    "- Estas citas provienen del registro permanente del tenant. Nunca digas que no existen.",
    "- Si falta un enlace de acceso, confirma que la cita existe e informa que el enlace se enviará por separado; no inventes uno."
  ];
  rows.forEach(function (row) {
    const link = validMeetingLink(row);
    lines.push("- " + cleanText(row.status, 40) + " | " + appointmentWhen(row.starts_at, options && options.timeZone) + " | " + (cleanText(row.appointment_service_name || row.consultation_reason, 180) || "Cita") + " | enlace=" + (link || "pendiente"));
  });
  return lines.join("\n");
}

module.exports = {
  ACTIVE_APPOINTMENT_STATUSES,
  appointmentWhen,
  appointmentsForConversation,
  buildAppointmentRecallContext,
  buildAppointmentRecallReply,
  classifyAppointmentRecallIntent,
  normalizedIdentity,
  validMeetingLink
};
