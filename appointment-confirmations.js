"use strict";

function text(value, limit) {
  return String(value == null ? "" : value).trim().slice(0, limit || 500);
}

function appointmentDateTime(iso, timeZone) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return { date: "", time: "" };
  const zone = text(timeZone, 80) || "America/Bogota";
  return {
    date: new Intl.DateTimeFormat("es-CO", {
      timeZone: zone,
      weekday: "long",
      day: "numeric",
      month: "long"
    }).format(date),
    time: new Intl.DateTimeFormat("es-CO", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit"
    }).format(date)
  };
}

function appointmentConfirmationText(appointment, configuration) {
  const when = appointmentDateTime(appointment && appointment.starts_at, configuration && configuration.timezone);
  const firstName = text(appointment && appointment.customer_name, 160).split(/\s+/)[0] || "Cliente";
  const business = text(configuration && configuration.business_name, 160) || "Nextfor";
  const service = text(appointment && appointment.consultation_reason, 240);
  const action = appointment && appointment.status === "rescheduled" ? "fue reprogramada" : "quedó confirmada";
  return "Hola " + firstName + " 👋 Tu cita con " + business + " " + action +
    " para el " + when.date + " a las " + when.time +
    (service ? " (" + service + ")" : "") +
    ". También te enviaremos los recordatorios configurados. Responde aquí si necesitas hacer un cambio.";
}

function confirmationState(appointment) {
  const state = appointment && appointment.confirmation_delivery;
  return state && typeof state === "object" && !Array.isArray(state) ? Object.assign({}, state) : {};
}

function retryAt(attempts, now) {
  const minutes = attempts <= 1 ? 2 : attempts === 2 ? 5 : 15;
  return new Date(new Date(now).getTime() + minutes * 60000).toISOString();
}

function createAppointmentConfirmationService(options) {
  options = options || {};
  const now = typeof options.now === "function" ? options.now : function () { return new Date(); };
  const loadAppointments = options.loadAppointments || (async function () { return []; });
  const loadConfiguration = options.loadConfiguration || (async function () { return {}; });
  const persist = options.persist || (async function () {});
  const deliver = options.deliver || (async function () { return { ok: false, error: "delivery_unavailable" }; });
  const backfillHours = Math.max(1, Math.min(Number(options.backfillHours) || 72, 168));
  const active = new Set();
  let firstProcess = true;

  async function send(appointment, sendOptions) {
    const current = now();
    const tenantId = text(appointment && appointment.tenant_id, 80);
    const appointmentId = text(appointment && (appointment.appointment_id || appointment.conversation_id), 160);
    const key = tenantId + ":" + appointmentId;
    if (!tenantId || !appointmentId || !appointment || !["booked", "rescheduled"].includes(appointment.status)) {
      return { ok: false, skipped: true, reason: "appointment_not_confirmed", appointment };
    }
    if (text(appointment.channel, 40).toLowerCase() !== "whatsapp" || !text(appointment.customer_phone, 80)) {
      return { ok: false, skipped: true, reason: "whatsapp_recipient_missing", appointment };
    }
    const state = confirmationState(appointment);
    if (state.status === "delivered") return { ok: true, skipped: true, reason: "already_delivered", appointment };
    if (state.next_attempt_at && Date.parse(state.next_attempt_at) > current.getTime() && !(sendOptions && sendOptions.forceRetry)) {
      return { ok: false, skipped: true, reason: "retry_not_due", appointment };
    }
    if (state.status === "sending" && current.getTime() - Date.parse(state.updated_at || "") < 2 * 60000) {
      return { ok: false, skipped: true, reason: "delivery_in_progress", appointment };
    }
    if (sendOptions && sendOptions.backfill && !state.status) {
      const createdAt = Date.parse(appointment.created_at || appointment.updated_at || "");
      if (!Number.isFinite(createdAt) || current.getTime() - createdAt > backfillHours * 60 * 60000) {
        return { ok: false, skipped: true, reason: "outside_backfill_window", appointment };
      }
    }
    if (active.has(key)) return { ok: false, skipped: true, reason: "delivery_in_progress", appointment };

    active.add(key);
    const attempts = Number(state.attempts || 0) + 1;
    let updated = Object.assign({}, appointment, {
      confirmation_delivery: {
        status: "sending",
        attempts,
        updated_at: current.toISOString(),
        error: ""
      },
      updated_at: current.toISOString()
    });
    try {
      await persist(updated);
      const configuration = await loadConfiguration(tenantId, appointment);
      const result = await deliver(appointment, appointmentConfirmationText(appointment, configuration));
      const completedAt = now().toISOString();
      if (result && result.ok) {
        updated = Object.assign({}, updated, {
          confirmation_delivery: {
            status: "delivered",
            attempts,
            sent_at: completedAt,
            delivered_at: completedAt,
            provider_id: text(result.provider_id, 240),
            mode: text(result.mode, 40) || "text",
            updated_at: completedAt,
            error: ""
          },
          updated_at: completedAt
        });
        await persist(updated);
        return { ok: true, appointment: updated, delivery: updated.confirmation_delivery };
      }
      const error = text(result && result.error && result.error.message || result && result.error || "whatsapp_confirmation_failed", 240);
      updated = Object.assign({}, updated, {
        confirmation_delivery: {
          status: "retrying",
          attempts,
          next_attempt_at: retryAt(attempts, completedAt),
          updated_at: completedAt,
          error
        },
        updated_at: completedAt
      });
      await persist(updated);
      return { ok: false, appointment: updated, delivery: updated.confirmation_delivery, error };
    } catch (deliveryError) {
      const failedAt = now().toISOString();
      const error = text(deliveryError && deliveryError.message || "whatsapp_confirmation_failed", 240);
      updated = Object.assign({}, updated, {
        confirmation_delivery: {
          status: "retrying",
          attempts,
          next_attempt_at: retryAt(attempts, failedAt),
          updated_at: failedAt,
          error
        },
        updated_at: failedAt
      });
      try { await persist(updated); } catch (_) {}
      return { ok: false, appointment: updated, delivery: updated.confirmation_delivery, error };
    } finally {
      active.delete(key);
    }
  }

  async function process() {
    const appointments = await loadAppointments();
    const outcome = { inspected: 0, delivered: 0, retrying: 0, skipped: 0 };
    const forceRetry = firstProcess;
    firstProcess = false;
    for (const appointment of appointments || []) {
      outcome.inspected += 1;
      const result = await send(appointment, { backfill: true, forceRetry });
      if (result.ok && !result.skipped) outcome.delivered += 1;
      else if (result.delivery && result.delivery.status === "retrying") outcome.retrying += 1;
      else outcome.skipped += 1;
    }
    return outcome;
  }

  return { process, send };
}

module.exports = {
  appointmentConfirmationText,
  appointmentDateTime,
  createAppointmentConfirmationService
};
