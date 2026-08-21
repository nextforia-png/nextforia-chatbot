"use strict";

const OFFSET_MINUTES = Object.freeze({ "24h": 24 * 60, "6h": 6 * 60 });

function text(value, limit) {
  return String(value == null ? "" : value).trim().slice(0, limit || 500);
}

function timingOffsets(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  const normalized = raw.toLowerCase();
  if (normalized === "both" || (normalized.includes("24") && normalized.includes("6"))) return ["24h", "6h"];
  if (normalized.includes("24")) return ["24h"];
  if (normalized.includes("6") || normalized === "2h") return ["6h"];
  return [];
}

function reminderState(appointment) {
  const current = appointment && appointment.reminder_deliveries;
  return current && typeof current === "object" && !Array.isArray(current) ? Object.assign({}, current) : {};
}

function dueAt(appointment, offset) {
  const start = new Date(appointment && appointment.starts_at).getTime();
  const minutes = OFFSET_MINUTES[offset];
  return Number.isFinite(start) && minutes ? new Date(start - minutes * 60000).toISOString() : "";
}

function shouldSend(appointment, offset, now) {
  const due = Date.parse(dueAt(appointment, offset));
  const start = Date.parse(appointment && appointment.starts_at);
  const current = new Date(now || Date.now()).getTime();
  return Number.isFinite(due) && Number.isFinite(start) && due <= current && current < start;
}

function missedDeliveryWindow(appointment, offset, now) {
  const due = Date.parse(dueAt(appointment, offset));
  const current = new Date(now || Date.now()).getTime();
  // A delayed worker must never send an old "24 h" message immediately before
  // the appointment. The small grace period tolerates normal timer drift.
  return Number.isFinite(due) && current - due > 15 * 60 * 1000;
}

function nextRetry(attempts, now) {
  const minutes = attempts <= 1 ? 5 : attempts === 2 ? 15 : 60;
  return new Date(new Date(now || Date.now()).getTime() + minutes * 60000).toISOString();
}

function appointmentDateTime(iso, timeZone) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return { date: "", time: "" };
  const zone = text(timeZone, 80) || "America/Bogota";
  return {
    date: new Intl.DateTimeFormat("es-CO", { timeZone: zone, weekday: "long", day: "numeric", month: "long" }).format(date),
    time: new Intl.DateTimeFormat("es-CO", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(date)
  };
}

function createAppointmentReminderService(options) {
  options = options || {};
  const now = typeof options.now === "function" ? options.now : function () { return new Date(); };
  const loadAppointments = options.loadAppointments || (async function () { return []; });
  const loadConfiguration = options.loadConfiguration || (async function () { return null; });
  const persist = options.persist || (async function () {});
  const deliver = options.deliver || (async function () { return { ok: false, error: { message: "delivery_unavailable" } }; });

  async function process() {
    const current = now();
    const appointments = await loadAppointments();
    const outcome = { inspected: 0, programmed: 0, delivered: 0, retrying: 0, blocked: 0, skipped: 0 };
    for (const appointment of appointments || []) {
      if (!appointment || !["booked", "rescheduled"].includes(appointment.status) || !appointment.starts_at) continue;
      outcome.inspected += 1;
      const configuration = await loadConfiguration(appointment.tenant_id, appointment);
      const reminder = configuration && configuration.reminder || configuration || {};
      const channel = text(reminder.channel, 30).toLowerCase();
      const offsets = timingOffsets(reminder.timing);
      if (channel !== "whatsapp" || !offsets.length || !text(appointment.customer_phone, 80)) {
        outcome.skipped += 1;
        continue;
      }
      const states = reminderState(appointment);
      let changed = false;
      for (const offset of offsets) {
        const existing = states[offset] || {};
        const due = dueAt(appointment, offset);
        if (!due) continue;
        if (!existing.status) {
          states[offset] = { status: "programmed", offset, due_at: due, attempts: 0, updated_at: current.toISOString() };
          changed = true;
          outcome.programmed += 1;
        }
        const state = states[offset];
        if (state.status !== "delivered" && state.status !== "cancelled" && missedDeliveryWindow(appointment, offset, current)) {
          states[offset] = Object.assign({}, state, {
            status: "missed",
            error: "appointment_reminder_due_window_elapsed",
            updated_at: current.toISOString()
          });
          changed = true;
          continue;
        }
        if (!shouldSend(appointment, offset, current)) continue;
        if (state.status === "delivered" || state.status === "cancelled") continue;
        if (state.next_attempt_at && Date.parse(state.next_attempt_at) > current.getTime()) continue;
        const template = text(reminder.template, 120);
        if (!template) {
          states[offset] = Object.assign({}, state, {
            status: "blocked_configuration",
            error: "appointment_reminder_template_not_configured",
            next_attempt_at: nextRetry(Number(state.attempts || 0) + 1, current),
            updated_at: current.toISOString()
          });
          changed = true;
          outcome.blocked += 1;
          continue;
        }
        const when = appointmentDateTime(appointment.starts_at, reminder.timezone);
        const result = await deliver(appointment, template, {
          customer_name: text(appointment.customer_name, 160) || "Cliente",
          appointment_date: when.date,
          appointment_time: when.time,
          business_name: text(reminder.business_name, 160) || "Nextfor"
        });
        if (result && result.ok) {
          states[offset] = Object.assign({}, state, { status: "delivered", sent_at: current.toISOString(), provider_id: text(result.provider_id, 200), attempts: Number(state.attempts || 0) + 1, updated_at: current.toISOString(), error: "" });
          outcome.delivered += 1;
        } else {
          const attempts = Number(state.attempts || 0) + 1;
          states[offset] = Object.assign({}, state, { status: "retrying", attempts, next_attempt_at: nextRetry(attempts, current), error: text(result && result.error && result.error.message || result && result.error || "whatsapp_reminder_failed", 240), updated_at: current.toISOString() });
          outcome.retrying += 1;
        }
        changed = true;
      }
      if (changed) await persist(Object.assign({}, appointment, { reminder_deliveries: states, updated_at: current.toISOString() }));
    }
    return outcome;
  }

  return { process };
}

module.exports = { OFFSET_MINUTES, appointmentDateTime, createAppointmentReminderService, dueAt, timingOffsets };
