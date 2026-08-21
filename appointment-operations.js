"use strict";

const crypto = require("crypto");

const APPOINTMENT_SETTINGS_VERSION = 1;
const APPOINTMENT_REMINDER_VERSION = 1;
const REMINDER_CHANNELS = new Set(["whatsapp", "email", "sms"]);
const REMINDER_STATUSES = new Set([
  "scheduled", "paused", "sending", "sent", "delivered", "read", "confirmed",
  "retrying", "no_response", "failed", "cancelled"
]);
const REMINDER_ACTIVE_STATUSES = new Set(["scheduled", "paused", "sending", "retrying", "failed"]);
const REMINDER_TERMINAL_STATUSES = new Set(["sent", "delivered", "read", "confirmed", "no_response", "cancelled"]);
const REMINDER_ACTIONS = new Set(["pause", "resume", "send_now", "retry"]);

class AppointmentOperationsError extends Error {
  constructor(code, status, details) {
    super(String(code || "appointment_operation_failed"));
    this.name = "AppointmentOperationsError";
    this.code = String(code || "appointment_operation_failed");
    this.status = Number(status) || 422;
    this.details = details || null;
  }
}

function text(value, max) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, max || 1000);
}

function tenant(value) {
  return text(value, 120).toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function iso(value, fallback) {
  const parsed = new Date(value || fallback || Date.now());
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function optionalIso(value) {
  const raw = text(value, 80);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function validDateOnly(value) {
  const raw = text(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const parts = raw.split("-").map(Number);
  const parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return parsed.getUTCFullYear() === parts[0] &&
    parsed.getUTCMonth() === parts[1] - 1 &&
    parsed.getUTCDate() === parts[2];
}

function integer(value, fallback, min, max) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function stableId(prefix, parts) {
  return prefix + crypto.createHash("sha256").update(parts.map(function (part) {
    return String(part == null ? "" : part);
  }).join("\u0000"), "utf8").digest("hex").slice(0, 32);
}

function normalizeRule(input, index, now) {
  const source = input && typeof input === "object" ? input : { text: input };
  const value = text(source.text, 2000);
  if (!value) return null;
  const id = text(source.id, 120).replace(/[^a-zA-Z0-9_-]/g, "") ||
    stableId("rule_", [value.toLowerCase()]);
  const createdAt = iso(source.created_at, now);
  return {
    id,
    text: value,
    active: source.active !== false,
    order: integer(source.order, index, 0, 10000),
    created_at: createdAt,
    updated_at: iso(source.updated_at, createdAt)
  };
}

function normalizeException(input, index, now) {
  const source = input && typeof input === "object" ? input : {};
  const date = text(source.date, 20);
  if (!validDateOnly(date)) return null;
  const mode = source.mode === "reschedule" || source.mode === "reagendar" ? "reschedule" : "close";
  const note = text(source.note, 1000);
  const id = text(source.id, 120).replace(/[^a-zA-Z0-9_-]/g, "") ||
    stableId("exception_", [date, mode, note.toLowerCase()]);
  const createdAt = iso(source.created_at, now);
  return {
    id,
    date,
    mode,
    note,
    active: source.active !== false,
    order: integer(source.order, index, 0, 10000),
    created_at: createdAt,
    updated_at: iso(source.updated_at, createdAt)
  };
}

function uniqueById(rows, max) {
  const seen = new Set();
  return rows.filter(Boolean).filter(function (row) {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  }).slice(0, max);
}

function timingOffsets(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(function (item) {
      return integer(item, 0, 1, 60 * 24 * 30);
    }).filter(Boolean))).sort(function (a, b) { return b - a; }).slice(0, 8);
  }
  const raw = text(value, 800).toLowerCase();
  if (!raw || raw === "none" || raw.indexOf("sin recordatorio") >= 0) return [];
  if (raw === "both" || raw.indexOf("24") >= 0 && raw.indexOf("6") >= 0) return [1440, 360];
  if (raw === "24h" || raw.indexOf("24") >= 0) return [1440];
  if (raw === "6h" || raw.indexOf("6 hora") >= 0) return [360];
  if (raw === "2h" || raw.indexOf("2 hora") >= 0) return [120];
  const matches = raw.match(/\d+/g) || [];
  return Array.from(new Set(matches.map(function (hours) {
    return integer(Number(hours) * 60, 0, 1, 60 * 24 * 30);
  }).filter(Boolean))).sort(function (a, b) { return b - a; }).slice(0, 8);
}

function normalizeReminderPolicy(input, fallback, now) {
  const source = input && typeof input === "object" ? input : {};
  const previous = fallback && typeof fallback === "object" ? fallback : {};
  const rawChannel = text(
    Object.prototype.hasOwnProperty.call(source, "channel") ? source.channel : previous.channel,
    40
  ).toLowerCase();
  const channel = REMINDER_CHANNELS.has(rawChannel) ? rawChannel : "";
  const offsetsInput = Object.prototype.hasOwnProperty.call(source, "offsets_minutes")
    ? source.offsets_minutes
    : previous.offsets_minutes;
  const offsets = timingOffsets(offsetsInput);
  const enabledInput = Object.prototype.hasOwnProperty.call(source, "enabled") ? source.enabled : previous.enabled;
  return {
    enabled: enabledInput !== false && !!channel && offsets.length > 0,
    channel,
    offsets_minutes: offsets,
    retry_after_minutes: integer(
      Object.prototype.hasOwnProperty.call(source, "retry_after_minutes")
        ? source.retry_after_minutes
        : previous.retry_after_minutes,
      120,
      5,
      7 * 24 * 60
    ),
    max_attempts: integer(
      Object.prototype.hasOwnProperty.call(source, "max_attempts") ? source.max_attempts : previous.max_attempts,
      2,
      1,
      5
    ),
    handoff_on_no_response: Object.prototype.hasOwnProperty.call(source, "handoff_on_no_response")
      ? source.handoff_on_no_response !== false
      : previous.handoff_on_no_response !== false,
    updated_at: iso(source.updated_at || previous.updated_at, now)
  };
}

function compileAvailabilityRules(rules, exceptions) {
  const activeRules = (rules || []).filter(function (row) { return row.active !== false && text(row.text, 2000); })
    .sort(function (a, b) { return Number(a.order) - Number(b.order); });
  const activeExceptions = (exceptions || []).filter(function (row) { return row.active !== false; })
    .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  const lines = [];
  if (activeRules.length) {
    lines.push("Reglas activas de disponibilidad:");
    activeRules.forEach(function (row) { lines.push("- " + row.text); });
  }
  if (activeExceptions.length) {
    if (lines.length) lines.push("");
    lines.push("Excepciones (siempre tienen prioridad sobre las reglas generales):");
    activeExceptions.forEach(function (row) {
      lines.push("- " + row.date + ": " +
        (row.mode === "reschedule" ? "reagendar las citas" : "no dar citas") +
        (row.note ? " — " + row.note : ""));
    });
  }
  return lines.join("\n").slice(0, 8000);
}

function legacyRule(availabilityRules, now) {
  const value = text(availabilityRules, 8000);
  return value ? normalizeRule({ id: stableId("rule_legacy_", [value]), text: value, active: true }, 0, now) : null;
}

function normalizeAppointmentSettings(input, options) {
  const source = input && typeof input === "object" ? input : {};
  const now = iso(options && options.now) || new Date().toISOString();
  let rulesInput = Array.isArray(source.scheduling_rules) ? source.scheduling_rules : [];
  if (!rulesInput.length) {
    const fallback = legacyRule(source.availability_rules, now);
    if (fallback) rulesInput = [fallback];
  }
  const rules = uniqueById(rulesInput.map(function (row, index) {
    return normalizeRule(row, index, now);
  }), 100);
  const exceptions = uniqueById((Array.isArray(source.schedule_exceptions) ? source.schedule_exceptions : [])
    .map(function (row, index) { return normalizeException(row, index, now); }), 500);
  const reminderPolicy = normalizeReminderPolicy(source.reminder_policy, null, now);
  return {
    version: APPOINTMENT_SETTINGS_VERSION,
    revision: integer(source.revision, 0, 0, Number.MAX_SAFE_INTEGER),
    scheduling_rules: rules,
    schedule_exceptions: exceptions,
    reminder_policy: reminderPolicy,
    availability_rules: compileAvailabilityRules(rules, exceptions),
    updated_at: iso(source.updated_at, now),
    updated_by: text(source.updated_by, 160)
  };
}

function appointmentSettingsFromOnboarding(onboarding, options) {
  const record = onboarding && typeof onboarding === "object" ? onboarding : {};
  const answers = record.answers && typeof record.answers === "object" ? record.answers : {};
  const answerSetup = answers.appointment_setup && typeof answers.appointment_setup === "object"
    ? answers.appointment_setup
    : {};
  const configuration = record.appointment_configuration && typeof record.appointment_configuration === "object"
    ? record.appointment_configuration
    : {};
  const source = Object.assign({}, configuration);
  if (!source.availability_rules) source.availability_rules = answerSetup.availability_rules;
  if (!Array.isArray(source.scheduling_rules) && Array.isArray(answerSetup.scheduling_rules)) {
    source.scheduling_rules = answerSetup.scheduling_rules;
  }
  if (!Array.isArray(source.schedule_exceptions) && Array.isArray(answerSetup.schedule_exceptions)) {
    source.schedule_exceptions = answerSetup.schedule_exceptions;
  }
  if (!source.reminder_policy) {
    const channel = text(configuration.reminder_channel || answerSetup.reminder_channel, 40).toLowerCase();
    const timing = configuration.reminder_timing || answerSetup.reminder_timing;
    source.reminder_policy = {
      enabled: !!channel && channel !== "none",
      channel,
      offsets_minutes: timingOffsets(timing),
      retry_after_minutes: 120,
      max_attempts: 2,
      handoff_on_no_response: true
    };
  }
  return normalizeAppointmentSettings(source, options);
}

function updateAppointmentSettings(currentInput, patchInput, options) {
  const optionsValue = options || {};
  const current = normalizeAppointmentSettings(currentInput, optionsValue);
  const expected = optionsValue.expectedRevision == null
    ? current.revision
    : integer(optionsValue.expectedRevision, -1, -1, Number.MAX_SAFE_INTEGER);
  if (expected !== current.revision) {
    throw new AppointmentOperationsError("appointment_settings_revision_conflict", 409, {
      expected_revision: expected,
      current_revision: current.revision
    });
  }
  const patch = patchInput && typeof patchInput === "object" ? patchInput : {};
  const now = iso(optionsValue.now) || new Date().toISOString();
  const merged = {
    revision: current.revision + 1,
    scheduling_rules: Object.prototype.hasOwnProperty.call(patch, "scheduling_rules")
      ? patch.scheduling_rules
      : current.scheduling_rules,
    schedule_exceptions: Object.prototype.hasOwnProperty.call(patch, "schedule_exceptions")
      ? patch.schedule_exceptions
      : current.schedule_exceptions,
    reminder_policy: normalizeReminderPolicy(patch.reminder_policy, current.reminder_policy, now),
    updated_at: now,
    updated_by: text(optionsValue.actor, 160)
  };
  return normalizeAppointmentSettings(merged, { now });
}

function appointmentIdentity(appointment) {
  const source = appointment && typeof appointment === "object" ? appointment : {};
  return text(source.appointment_id || source.id || source.conversation_id, 160);
}

function customerConversationIdentity(appointment) {
  const source = appointment && typeof appointment === "object" ? appointment : {};
  const explicit = text(source.customer_conversation_id || source.conversation_user_id, 500);
  if (explicit) return explicit;
  const channel = text(source.channel, 40).toLowerCase();
  return ["whatsapp", "instagram", "messenger", "facebook"].includes(channel)
    ? text(source.conversation_id, 500)
    : "";
}

function reminderId(tenantId, appointmentId, startsAt, offsetMinutes) {
  return stableId("rem_", [tenantId, appointmentId, startsAt, offsetMinutes]);
}

function normalizeReminder(input) {
  const source = input && typeof input === "object" ? input : {};
  const normalizedStatus = text(source.status, 40).toLowerCase().replace(/[\s-]+/g, "_");
  const status = REMINDER_STATUSES.has(normalizedStatus) ? normalizedStatus : "scheduled";
  return Object.assign({}, source, {
    version: APPOINTMENT_REMINDER_VERSION,
    id: text(source.id, 120),
    tenant_id: tenant(source.tenant_id),
    appointment_id: text(source.appointment_id, 160),
    reminder_key: text(source.reminder_key || source.dedupe_key || source.id, 500),
    conversation_id: text(source.conversation_id || source.customer_conversation_id, 500),
    channel: REMINDER_CHANNELS.has(text(source.channel, 40).toLowerCase())
      ? text(source.channel, 40).toLowerCase()
      : "",
    offset_minutes: integer(source.offset_minutes, 0, 0, 60 * 24 * 30),
    scheduled_for: optionalIso(source.scheduled_for),
    status,
    attempts: integer(source.attempts, 0, 0, 100),
    created_at: iso(source.created_at) || new Date().toISOString(),
    updated_at: iso(source.updated_at) || new Date().toISOString()
  });
}

function materializeAppointmentReminders(appointmentInput, settingsInput, existingInput, options) {
  const appointment = appointmentInput && typeof appointmentInput === "object" ? appointmentInput : {};
  const settings = normalizeAppointmentSettings(settingsInput, options);
  const tenantId = tenant(appointment.tenant_id);
  const appointmentId = appointmentIdentity(appointment);
  const conversationId = customerConversationIdentity(appointment);
  const startsAt = iso(appointment.starts_at);
  if (!tenantId || !appointmentId) {
    throw new AppointmentOperationsError("appointment_reminder_scope_required", 422);
  }
  const now = iso(options && options.now) || new Date().toISOString();
  const existing = (Array.isArray(existingInput) ? existingInput : []).map(normalizeReminder).filter(function (row) {
    return row.tenant_id === tenantId && row.appointment_id === appointmentId;
  });
  const existingById = new Map(existing.map(function (row) { return [row.id, row]; }));
  const booked = ["booked", "rescheduled"].includes(text(appointment.status, 40));
  const policy = settings.reminder_policy;
  const expected = [];
  if (booked && startsAt && policy.enabled) {
    policy.offsets_minutes.forEach(function (offsetMinutes) {
      const id = reminderId(tenantId, appointmentId, startsAt, offsetMinutes);
      const previous = existingById.get(id);
      const scheduledFor = new Date(new Date(startsAt).getTime() - offsetMinutes * 60 * 1000).toISOString();
      expected.push(normalizeReminder(Object.assign({}, previous || {}, {
        id,
        tenant_id: tenantId,
        appointment_id: appointmentId,
        conversation_id: conversationId,
        channel: policy.channel,
        offset_minutes: offsetMinutes,
        scheduled_for: scheduledFor,
        status: previous && previous.status || "scheduled",
        attempts: previous && previous.attempts || 0,
        reminder_key: [tenantId, appointmentId, startsAt, offsetMinutes].join(":"),
        created_at: previous && previous.created_at || now,
        updated_at: previous && previous.updated_at || now
      })));
    });
  }
  const expectedIds = new Set(expected.map(function (row) { return row.id; }));
  const obsolete = existing.filter(function (row) { return !expectedIds.has(row.id); }).map(function (row) {
    if (!REMINDER_ACTIVE_STATUSES.has(row.status)) return row;
    return normalizeReminder(Object.assign({}, row, {
      status: "cancelled",
      last_action: booked ? "appointment_rescheduled" : "appointment_cancelled",
      updated_at: now
    }));
  });
  return expected.concat(obsolete).sort(function (left, right) {
    return String(left.scheduled_for || "").localeCompare(String(right.scheduled_for || ""));
  });
}

function reminderTimingLabel(row, now) {
  const when = new Date(row && row.scheduled_for).getTime();
  const current = new Date(now || Date.now()).getTime();
  if (!Number.isFinite(when) || !Number.isFinite(current)) return "";
  const minutes = Math.round((when - current) / 60000);
  if (minutes > 24 * 60) return "En " + Math.ceil(minutes / (24 * 60)) + " días";
  if (minutes > 60) return "En " + Math.ceil(minutes / 60) + " h";
  if (minutes > 0) return "En " + minutes + " min";
  const ago = Math.abs(minutes);
  if (ago < 60) return "Hace " + ago + " min";
  if (ago < 24 * 60) return "Hace " + Math.floor(ago / 60) + " h";
  return "Hace " + Math.floor(ago / (24 * 60)) + " días";
}

function reminderSnapshot(recordsInput, options) {
  const now = iso(options && options.now) || new Date().toISOString();
  const tenantId = tenant(options && options.tenantId);
  const records = (Array.isArray(recordsInput) ? recordsInput : []).map(normalizeReminder).filter(function (row) {
    return !tenantId || row.tenant_id === tenantId;
  }).map(function (row) {
    const due = ["scheduled", "retrying", "failed"].includes(row.status) &&
      new Date(row.scheduled_for).getTime() <= new Date(now).getTime();
    return Object.assign({}, row, {
      due,
      group: REMINDER_ACTIVE_STATUSES.has(row.status) ? "upcoming" : "sent",
      timing: reminderTimingLabel(row, now)
    });
  }).sort(function (left, right) {
    return String(left.scheduled_for || "").localeCompare(String(right.scheduled_for || ""));
  });
  return {
    tenant_id: tenantId || null,
    count: records.length,
    due_count: records.filter(function (row) { return row.due; }).length,
    scheduled_count: records.filter(function (row) { return REMINDER_ACTIVE_STATUSES.has(row.status); }).length,
    sent_count: records.filter(function (row) { return REMINDER_TERMINAL_STATUSES.has(row.status) && row.status !== "cancelled"; }).length,
    needs_attention_count: records.filter(function (row) { return ["failed", "no_response"].includes(row.status); }).length,
    items: records
  };
}

function deriveAppointmentReminderStatus(recordsInput, options) {
  const snapshot = reminderSnapshot(recordsInput, options);
  const statuses = snapshot.items.map(function (row) { return row.status; });
  const precedence = [
    "sending", "retrying", "failed", "scheduled", "paused",
    "confirmed", "read", "delivered", "sent", "no_response", "cancelled"
  ];
  const rawStatus = precedence.find(function (status) { return statuses.includes(status); });
  const panelStatus = rawStatus === "scheduled" ? "programmed" : (rawStatus || "not_scheduled");
  const next = snapshot.items.find(function (row) {
    return ["scheduled", "retrying", "failed", "paused"].includes(row.status);
  });
  const activityTimes = snapshot.items.map(function (row) {
    return optionalIso(row.updated_at || row.last_action_at || row.scheduled_for);
  }).filter(Boolean).sort();
  return {
    status: panelStatus,
    next_scheduled_at: next && next.scheduled_for || null,
    last_activity_at: activityTimes.length ? activityTimes[activityTimes.length - 1] : null,
    due_count: snapshot.due_count,
    needs_attention: snapshot.needs_attention_count > 0,
    deliveries: snapshot.items
  };
}

function applyReminderAction(recordInput, actionInput, options) {
  const record = normalizeReminder(recordInput);
  const action = text(actionInput, 40).toLowerCase().replace(/[\s-]+/g, "_");
  const scopedTenant = tenant(options && options.tenantId);
  if (!record.id || !record.tenant_id || !record.appointment_id) {
    throw new AppointmentOperationsError("appointment_reminder_not_found", 404);
  }
  if (scopedTenant && scopedTenant !== record.tenant_id) {
    throw new AppointmentOperationsError("appointment_reminder_not_found", 404);
  }
  if (!REMINDER_ACTIONS.has(action)) {
    throw new AppointmentOperationsError("invalid_appointment_reminder_action", 400);
  }
  const allowed = {
    pause: ["scheduled", "retrying"],
    resume: ["paused"],
    send_now: ["scheduled", "paused", "retrying", "failed"],
    retry: ["failed", "no_response"]
  };
  if (!allowed[action].includes(record.status)) {
    throw new AppointmentOperationsError("appointment_reminder_action_not_allowed", 409, {
      action,
      status: record.status
    });
  }
  const now = iso(options && options.now) || new Date().toISOString();
  const status = action === "pause" ? "paused" : "scheduled";
  return normalizeReminder(Object.assign({}, record, {
    status,
    scheduled_for: action === "send_now" || action === "retry" ? now : record.scheduled_for,
    force_send: action === "send_now" || action === "retry",
    last_action: action,
    last_action_by: text(options && options.actor, 160),
    last_action_at: now,
    updated_at: now
  }));
}

module.exports = {
  APPOINTMENT_REMINDER_VERSION,
  APPOINTMENT_SETTINGS_VERSION,
  REMINDER_ACTIONS,
  REMINDER_ACTIVE_STATUSES,
  REMINDER_STATUSES,
  AppointmentOperationsError,
  applyReminderAction,
  appointmentSettingsFromOnboarding,
  compileAvailabilityRules,
  deriveAppointmentReminderStatus,
  materializeAppointmentReminders,
  normalizeAppointmentSettings,
  normalizeReminder,
  normalizeReminderPolicy,
  reminderId,
  reminderSnapshot,
  timingOffsets,
  updateAppointmentSettings
};
