"use strict";

const APPOINTMENT_STATUSES = new Set([
  "booked",
  "requested",
  "failed",
  "cancelled",
  "rescheduled",
  "not_requested"
]);

function cleanText(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max || 500);
}

function cleanStatus(value) {
  const status = cleanText(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
  return APPOINTMENT_STATUSES.has(status) ? status : "not_requested";
}

function validIsoDate(value) {
  const text = cleanText(value, 80);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function analysisValue(collection, key) {
  const entry = collection && collection[key];
  if (entry == null) return "";
  if (typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, "value")) return entry.value;
  return entry;
}

function dataCollectionFromAnalysis(analysis) {
  analysis = analysis || {};
  return analysis.data_collection_results || analysis.data_collection || analysis.collected_data || {};
}

function transcriptSummary(analysis) {
  return cleanText(analysis && (analysis.transcript_summary || analysis.summary), 2000);
}

function appointmentFromElevenLabsEvent(event, tenantId, now) {
  if (!event || event.type !== "post_call_transcription" || !event.data) return null;
  const data = event.data;
  const conversationId = cleanText(data.conversation_id, 160);
  const agentId = cleanText(data.agent_id, 160);
  if (!conversationId || !agentId || !tenantId) return null;
  const collection = dataCollectionFromAnalysis(data.analysis);
  const createdAt = new Date((Number(event.event_timestamp) || Math.floor((now || Date.now()) / 1000)) * 1000).toISOString();
  const status = cleanStatus(analysisValue(collection, "appointment_status"));
  return {
    tenant_id: cleanText(tenantId, 80),
    conversation_id: conversationId,
    agent_id: agentId,
    status,
    starts_at: validIsoDate(analysisValue(collection, "appointment_datetime")),
    customer_name: cleanText(analysisValue(collection, "client_name"), 160),
    customer_phone: cleanText(analysisValue(collection, "client_phone"), 80),
    customer_email: cleanText(analysisValue(collection, "client_email"), 200).toLowerCase(),
    consultation_reason: cleanText(analysisValue(collection, "consultation_reason"), 1000),
    data_processing_consent: cleanText(analysisValue(collection, "data_processing_consent"), 40).toLowerCase() || "unclear",
    transcript_summary: transcriptSummary(data.analysis),
    source: "elevenlabs",
    channel: cleanText(data.metadata && (data.metadata.channel || data.metadata.type), 40) || "voice",
    created_at: createdAt,
    updated_at: createdAt
  };
}

function normalizeAppointment(input) {
  input = input || {};
  const conversationId = cleanText(input.conversation_id, 160);
  const tenantId = cleanText(input.tenant_id, 80);
  if (!conversationId || !tenantId) return null;
  return {
    tenant_id: tenantId,
    conversation_id: conversationId,
    agent_id: cleanText(input.agent_id, 160),
    status: cleanStatus(input.status),
    starts_at: validIsoDate(input.starts_at),
    customer_name: cleanText(input.customer_name, 160),
    customer_phone: cleanText(input.customer_phone, 80),
    customer_email: cleanText(input.customer_email, 200).toLowerCase(),
    consultation_reason: cleanText(input.consultation_reason, 1000),
    data_processing_consent: cleanText(input.data_processing_consent, 40).toLowerCase() || "unclear",
    transcript_summary: cleanText(input.transcript_summary, 2000),
    source: cleanText(input.source, 40) || "elevenlabs",
    channel: cleanText(input.channel, 40) || "voice",
    created_at: validIsoDate(input.created_at) || new Date().toISOString(),
    updated_at: validIsoDate(input.updated_at) || new Date().toISOString()
  };
}

class AppointmentRegistry {
  constructor(options) {
    this.rows = new Map();
    this.onUpsert = options && options.onUpsert;
  }

  key(row) {
    return row.tenant_id + ":" + row.conversation_id;
  }

  async upsert(input, persist) {
    const row = normalizeAppointment(input);
    if (!row) throw new Error("invalid_appointment");
    const key = this.key(row);
    const existing = this.rows.get(key);
    const merged = Object.assign({}, existing || {}, row, {
      created_at: existing && existing.created_at || row.created_at,
      updated_at: row.updated_at || new Date().toISOString()
    });
    this.rows.set(key, merged);
    if (persist !== false && typeof this.onUpsert === "function") await this.onUpsert(merged);
    return merged;
  }

  async ingestElevenLabs(event, tenantId) {
    const row = appointmentFromElevenLabsEvent(event, tenantId);
    if (!row) return null;
    return this.upsert(row, true);
  }

  hydrate(rows) {
    (rows || []).forEach(row => {
      const normalized = normalizeAppointment(row);
      if (normalized) this.rows.set(this.key(normalized), normalized);
    });
  }

  list(tenantId) {
    return Array.from(this.rows.values()).filter(row => row.tenant_id === tenantId).sort(function (a, b) {
      return new Date(b.starts_at || b.updated_at || 0) - new Date(a.starts_at || a.updated_at || 0);
    });
  }

  snapshot(tenantId, now) {
    const rows = this.list(tenantId);
    const current = now == null ? Date.now() : Number(now);
    const countedRequested = new Set(["booked", "requested", "failed", "cancelled", "rescheduled"]);
    const metrics = {
      interactions: rows.length,
      requested: rows.filter(row => countedRequested.has(row.status)).length,
      booked: rows.filter(row => row.status === "booked" || row.status === "rescheduled").length,
      pending: rows.filter(row => row.status === "requested").length,
      cancelled: rows.filter(row => row.status === "cancelled").length,
      failed: rows.filter(row => row.status === "failed").length
    };
    const upcoming = rows.filter(function (row) {
      return row.starts_at && new Date(row.starts_at).getTime() >= current && (row.status === "booked" || row.status === "rescheduled");
    }).sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
    return { tenant_id: tenantId, metrics, appointments: rows.slice(0, 200), upcoming: upcoming.slice(0, 50) };
  }
}

module.exports = {
  APPOINTMENT_STATUSES,
  AppointmentRegistry,
  appointmentFromElevenLabsEvent,
  normalizeAppointment
};
