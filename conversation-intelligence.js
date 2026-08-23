"use strict";

const crypto = require("crypto");

const CONTRACT_VERSION = 1;
const CONVERSATION_STATUSES = Object.freeze(["open", "resolved", "archived"]);
const OUTCOME_TYPES = Object.freeze(["unknown", "support", "appointment", "order", "handoff", "mixed"]);
const VALUE_STATUSES = Object.freeze(["potential", "confirmed", "paid", "lost", "cancelled"]);
const BUSINESS_OBJECT_TYPES = Object.freeze(["appointment", "order"]);
const MESSAGE_DIRECTIONS = Object.freeze(["customer", "bot", "human", "system"]);

class ConversationIntelligenceError extends Error {
  constructor(code, message, status) {
    super(message || code);
    this.name = "ConversationIntelligenceError";
    this.code = code;
    this.status = status || 400;
  }
}

function text(value, maximum) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, maximum || 500);
}

function tenantId(value) {
  const clean = text(value, 64).toLowerCase();
  return /^[a-z0-9][a-z0-9-]{2,63}$/.test(clean) ? clean : "";
}

function channelId(value) {
  const clean = text(value, 40).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(clean) ? clean : "";
}

function botId(value) {
  return text(value, 80).toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

function iso(value, fallback) {
  const parsed = new Date(value || "");
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return fallback || null;
}

function integer(value, maximum) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, maximum == null ? Number.MAX_SAFE_INTEGER : maximum);
}

function nullableAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Math.round(Number(value));
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ConversationIntelligenceError("amount_minor_invalid", "amount_minor must be a non-negative safe integer.");
  }
  return parsed;
}

function currency(value, amountMinor) {
  const clean = text(value, 3).toUpperCase();
  if (amountMinor != null && !/^[A-Z]{3}$/.test(clean)) {
    throw new ConversationIntelligenceError("currency_required", "A three-letter ISO currency is required when amount_minor is present.");
  }
  return clean || null;
}

function required(value, code, message) {
  if (!value) throw new ConversationIntelligenceError(code, message);
  return value;
}

function conversationIdentity(input) {
  input = input || {};
  return {
    tenant_id: required(tenantId(input.tenant_id), "tenant_required", "tenant_id is required."),
    channel: required(channelId(input.channel), "channel_required", "channel is required."),
    conversation_id: required(text(input.conversation_id, 500), "conversation_id_required", "conversation_id is required.")
  };
}

function conversationIdentityKey(input) {
  const identity = conversationIdentity(input);
  return [identity.tenant_id, identity.channel, identity.conversation_id].join("\u001f");
}

// This deliberately matches bot-ops.js. Bot Ops can join a finding without
// receiving or duplicating the customer's raw channel identifier.
function botOpsConversationKey(input) {
  return crypto.createHash("sha256").update(conversationIdentityKey(input)).digest("hex");
}

function normalizeConversationSummary(input, options) {
  input = input || {};
  options = options || {};
  const identity = conversationIdentity(input);
  const now = iso(options.now, new Date().toISOString());
  const firstMessageAt = iso(input.first_message_at);
  const lastMessageAt = iso(input.last_message_at);
  const status = CONVERSATION_STATUSES.includes(input.conversation_status) ? input.conversation_status : "open";
  const outcomeType = OUTCOME_TYPES.includes(input.outcome_type) ? input.outcome_type : "unknown";
  const outcomeStatus = VALUE_STATUSES.includes(input.outcome_status) ? input.outcome_status : null;
  const direction = MESSAGE_DIRECTIONS.includes(input.last_message_direction) ? input.last_message_direction : null;
  const primaryBotId = required(botId(input.primary_bot_id), "primary_bot_id_required", "primary_bot_id is required.");
  const activeBotId = botId(input.active_bot_id) || primaryBotId;
  if (outcomeStatus && !["appointment", "order", "mixed"].includes(outcomeType)) {
    throw new ConversationIntelligenceError("outcome_type_required", "A value status requires an appointment, order or mixed outcome.");
  }
  const computedBotOpsKey = botOpsConversationKey(identity);
  const suppliedBotOpsKey = text(input.bot_ops_conversation_key, 64).toLowerCase();
  if (suppliedBotOpsKey && suppliedBotOpsKey !== computedBotOpsKey) {
    throw new ConversationIntelligenceError("bot_ops_conversation_key_mismatch", "bot_ops_conversation_key must be derived from the canonical conversation identity.", 409);
  }
  return {
    contract_version: CONTRACT_VERSION,
    tenant_id: identity.tenant_id,
    conversation_id: identity.conversation_id,
    channel: identity.channel,
    channel_connection_id: text(input.channel_connection_id, 200) || null,
    primary_bot_id: primaryBotId,
    active_bot_id: activeBotId,
    customer_ref: text(input.customer_ref, 500) || null,
    conversation_status: status,
    outcome_type: outcomeType,
    outcome_status: outcomeStatus,
    outcome_reason: text(input.outcome_reason, 500) || null,
    outcome_updated_at: outcomeStatus || outcomeType !== "unknown" ? iso(input.outcome_updated_at, now) : null,
    first_message_at: firstMessageAt,
    last_message_at: lastMessageAt,
    message_count: integer(input.message_count),
    last_message_preview: text(input.last_message_preview, 240) || null,
    last_message_direction: direction,
    needs_human: input.needs_human === true,
    bot_ops_conversation_key: computedBotOpsKey,
    created_at: iso(input.created_at, firstMessageAt || now),
    updated_at: iso(input.updated_at, lastMessageAt || now)
  };
}

function canTransitionValue(previous, next) {
  if (!previous) return VALUE_STATUSES.includes(next);
  if (previous === next) return true;
  const allowed = {
    potential: ["confirmed", "paid", "lost", "cancelled"],
    confirmed: ["paid", "lost", "cancelled"],
    paid: ["cancelled"],
    lost: ["potential", "confirmed"],
    cancelled: ["potential", "confirmed"]
  };
  return !!allowed[previous] && allowed[previous].includes(next);
}

function normalizeBusinessObject(input, options) {
  input = input || {};
  options = options || {};
  const identity = conversationIdentity(input);
  const objectType = text(input.object_type, 40).toLowerCase();
  const valueStatus = text(input.value_status, 40).toLowerCase();
  required(BUSINESS_OBJECT_TYPES.includes(objectType) && objectType, "object_type_invalid", "object_type must be appointment or order.");
  required(text(input.object_id, 200), "object_id_required", "object_id is required.");
  required(VALUE_STATUSES.includes(valueStatus) && valueStatus, "value_status_invalid", "value_status must be potential, confirmed, paid, lost or cancelled.");
  if (options.previousValueStatus && !canTransitionValue(options.previousValueStatus, valueStatus)) {
    throw new ConversationIntelligenceError("value_transition_invalid", "The value status cannot move backwards without an authoritative reactivation.", 409);
  }
  const amountMinor = nullableAmount(input.amount_minor);
  const occurredAt = iso(input.occurred_at, iso(options.now, new Date().toISOString()));
  return {
    contract_version: CONTRACT_VERSION,
    tenant_id: identity.tenant_id,
    conversation_id: identity.conversation_id,
    channel: identity.channel,
    object_type: objectType,
    object_id: text(input.object_id, 200),
    object_status: text(input.object_status, 80) || null,
    value_status: valueStatus,
    amount_minor: amountMinor,
    currency: currency(input.currency, amountMinor),
    is_primary: input.is_primary === true,
    source_event_id: required(text(input.source_event_id, 500), "source_event_id_required", "source_event_id is required for idempotency."),
    occurred_at: occurredAt,
    metadata: input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {},
    updated_at: iso(input.updated_at, occurredAt)
  };
}

function normalizeDetailPageQuery(input) {
  input = input || {};
  return {
    limit: Math.max(1, Math.min(200, Number(input.limit) || 100)),
    before_message_at: iso(input.before_message_at),
    before_message_id: text(input.before_message_id, 100) || null
  };
}

function valueStatusForAppointment(status) {
  const clean = text(status, 40).toLowerCase();
  if (["booked", "rescheduled"].includes(clean)) return "confirmed";
  if (clean === "cancelled") return "cancelled";
  if (clean === "failed") return "lost";
  return "potential";
}

function valueStatusForOrder(status) {
  const clean = text(status, 40).toLowerCase();
  if (["pagado", "preparacion", "enviado", "paid", "fulfilled"].includes(clean)) return "paid";
  if (["cancelado", "cancelled", "refunded"].includes(clean)) return "cancelled";
  if (["confirmed", "confirmado"].includes(clean)) return "confirmed";
  return "potential";
}

function businessObjectFromAppointment(appointment, options) {
  appointment = appointment || {};
  options = options || {};
  const conversationId = text(appointment.customer_conversation_id, 500);
  if (!conversationId) {
    throw new ConversationIntelligenceError("customer_conversation_id_required", "A provider call ID cannot be used as a customer conversation.");
  }
  return normalizeBusinessObject({
    tenant_id: appointment.tenant_id,
    conversation_id: conversationId,
    channel: options.channel || appointment.channel,
    object_type: "appointment",
    object_id: appointment.appointment_id || appointment.id,
    object_status: appointment.status,
    value_status: options.value_status || valueStatusForAppointment(appointment.status),
    amount_minor: options.amount_minor,
    currency: options.currency,
    is_primary: options.is_primary,
    source_event_id: options.source_event_id || ["appointment", appointment.appointment_id || appointment.id, appointment.updated_at || appointment.status].join(":"),
    occurred_at: appointment.updated_at || appointment.created_at,
    metadata: options.metadata
  }, options);
}

function businessObjectFromOrder(order, options) {
  order = order || {};
  options = options || {};
  return normalizeBusinessObject({
    tenant_id: order.tenant_id,
    conversation_id: order.conversation_id,
    channel: options.channel || order.channel,
    object_type: "order",
    object_id: order.id || order.order_id,
    object_status: order.stage || order.status,
    value_status: options.value_status || valueStatusForOrder(order.stage || order.status),
    amount_minor: options.amount_minor == null ? order.total : options.amount_minor,
    currency: options.currency || order.currency,
    is_primary: options.is_primary,
    source_event_id: options.source_event_id || order.source_event_id || ["order", order.id || order.order_id, order.revision || order.stage].join(":"),
    occurred_at: order.updated_at || order.created_at,
    metadata: options.metadata
  }, options);
}

class InMemoryConversationIntelligenceStore {
  constructor(options) {
    this.summaries = new Map();
    this.objects = new Map();
    this.messages = options && typeof options.loadMessages === "function" ? options.loadMessages : async function () { return []; };
  }

  async upsertSummary(input) {
    const normalized = normalizeConversationSummary(input);
    const key = conversationIdentityKey(normalized);
    const previous = this.summaries.get(key);
    const merged = previous ? Object.assign({}, previous, normalized, {
      primary_bot_id: previous.primary_bot_id || normalized.primary_bot_id,
      first_message_at: [previous.first_message_at, normalized.first_message_at].filter(Boolean).sort()[0] || null,
      last_message_at: [previous.last_message_at, normalized.last_message_at].filter(Boolean).sort().slice(-1)[0] || null,
      message_count: Math.max(previous.message_count || 0, normalized.message_count || 0),
      created_at: [previous.created_at, normalized.created_at].filter(Boolean).sort()[0]
    }) : normalized;
    if (previous && (!normalized.outcome_updated_at || (previous.outcome_updated_at && normalized.outcome_updated_at < previous.outcome_updated_at))) {
      merged.outcome_type = previous.outcome_type;
      merged.outcome_status = previous.outcome_status;
      merged.outcome_reason = previous.outcome_reason;
      merged.outcome_updated_at = previous.outcome_updated_at;
    }
    if (previous && (!normalized.last_message_at || (previous.last_message_at && normalized.last_message_at < previous.last_message_at))) {
      merged.last_message_preview = previous.last_message_preview;
      merged.last_message_direction = previous.last_message_direction;
    }
    this.summaries.set(key, JSON.parse(JSON.stringify(merged)));
    return merged;
  }

  async upsertBusinessObject(input) {
    const objectKey = [tenantId(input.tenant_id), text(input.object_type, 40), text(input.object_id, 200)].join("\u001f");
    const previous = this.objects.get(objectKey);
    const normalized = normalizeBusinessObject(input);
    if (previous && conversationIdentityKey(previous) !== conversationIdentityKey(normalized)) {
      throw new ConversationIntelligenceError("business_object_reassignment_blocked", "An appointment or order cannot be reassigned to another conversation.", 409);
    }
    if (previous && normalized.occurred_at < previous.occurred_at) return previous;
    if (previous && !canTransitionValue(previous.value_status, normalized.value_status)) {
      throw new ConversationIntelligenceError("value_transition_invalid", "The value status cannot move backwards without an authoritative reactivation.", 409);
    }
    const conversation = this.summaries.get(conversationIdentityKey(normalized));
    if (!conversation) throw new ConversationIntelligenceError("conversation_not_found", "The business object must reference an existing conversation.", 404);
    this.objects.set(objectKey, JSON.parse(JSON.stringify(normalized)));
    if (!conversation.outcome_updated_at || normalized.occurred_at >= conversation.outcome_updated_at) {
      await this.upsertSummary(Object.assign({}, conversation, {
        outcome_type: ["unknown", normalized.object_type].includes(conversation.outcome_type)
          ? normalized.object_type
          : "mixed",
        outcome_status: normalized.value_status,
        outcome_reason: normalized.object_type + ":" + (normalized.object_status || normalized.value_status),
        outcome_updated_at: normalized.occurred_at,
        updated_at: normalized.updated_at
      }));
    }
    return normalized;
  }

  async listSummaries(targetTenantId, options) {
    const cleanTenant = required(tenantId(targetTenantId), "tenant_required", "tenant_id is required.");
    options = options || {};
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
    const before = iso(options.before_activity);
    return Array.from(this.summaries.values()).filter(function (row) {
      return row.tenant_id === cleanTenant && (!before || (row.last_message_at || row.updated_at) < before);
    }).sort(function (a, b) {
      return String(b.last_message_at || b.updated_at).localeCompare(String(a.last_message_at || a.updated_at)) || a.conversation_id.localeCompare(b.conversation_id);
    }).slice(0, limit).map(function (row) {
      const summary = JSON.parse(JSON.stringify(row));
      delete summary.messages;
      const rowKey = conversationIdentityKey(row);
      const objects = Array.from(this.objects.values()).filter(function (object) {
        return conversationIdentityKey(object) === rowKey;
      });
      summary.appointment_count = objects.filter(function (object) { return object.object_type === "appointment"; }).length;
      summary.order_count = objects.filter(function (object) { return object.object_type === "order"; }).length;
      ["potential", "confirmed", "paid"].forEach(function (status) {
        summary[status + "_value_minor"] = objects.filter(function (object) {
          return object.value_status === status;
        }).reduce(function (sum, object) { return sum + Number(object.amount_minor || 0); }, 0);
      });
      summary.lost_cancelled_count = objects.filter(function (object) {
        return ["lost", "cancelled"].includes(object.value_status);
      }).length;
      summary.open_bot_ops_findings = 0;
      summary.highest_bot_ops_severity = null;
      summary.last_bot_ops_review_at = null;
      return summary;
    }, this);
  }

  async getConversation(identity) {
    return this.summaries.get(conversationIdentityKey(identity)) || null;
  }

  async listBusinessObjects(identity) {
    const key = conversationIdentityKey(identity);
    return Array.from(this.objects.values()).filter(function (row) { return conversationIdentityKey(row) === key; });
  }

  async listBotOpsFindings() { return []; }
  async loadMessages(identity, options) { return this.messages(identity, options); }
}

class SupabaseConversationIntelligenceStore {
  constructor(options) {
    options = options || {};
    this.url = text(options.url, 1000).replace(/\/$/, "");
    this.headers = Object.assign({}, options.headers || {});
    this.http = options.axiosClient;
    this.messages = options.loadMessages;
    if (!this.url || !this.http) throw new Error("conversation_intelligence_store_not_configured");
  }

  async upsertSummary(input) {
    const normalized = normalizeConversationSummary(input);
    const response = await this.http.post(this.url + "/rest/v1/rpc/upsert_conversation_intelligence_v1", { p_record: normalized }, { headers: this.headers, timeout: 8000 });
    return Array.isArray(response.data) ? response.data[0] : response.data;
  }

  async upsertBusinessObject(input) {
    const normalized = normalizeBusinessObject(input);
    const response = await this.http.post(this.url + "/rest/v1/rpc/upsert_conversation_business_object_v1", { p_record: normalized }, { headers: this.headers, timeout: 8000 });
    return Array.isArray(response.data) ? response.data[0] : response.data;
  }

  async listSummaries(targetTenantId, options) {
    options = options || {};
    const cleanTenant = required(tenantId(targetTenantId), "tenant_required", "tenant_id is required.");
    const response = await this.http.post(this.url + "/rest/v1/rpc/list_conversation_intelligence_summaries_v1", {
      p_tenant_id: cleanTenant,
      p_limit: Math.max(1, Math.min(200, Number(options.limit) || 50)),
      p_before_activity: iso(options.before_activity),
      p_before_id: text(options.before_id, 36) || null
    }, { headers: this.headers, timeout: 10000 });
    return Array.isArray(response.data) ? response.data : [];
  }

  async getConversation(input) {
    const identity = conversationIdentity(input);
    const response = await this.http.get(this.url + "/rest/v1/conversation_intelligence", {
      params: {
        select: "contract_version,id,tenant_id,conversation_id,channel,channel_connection_id,primary_bot_id,active_bot_id,customer_ref,conversation_status,outcome_type,outcome_status,outcome_reason,outcome_updated_at,first_message_at,last_message_at,message_count,last_message_preview,last_message_direction,needs_human,bot_ops_conversation_key,created_at,updated_at",
        tenant_id: "eq." + identity.tenant_id,
        channel: "eq." + identity.channel,
        conversation_id: "eq." + identity.conversation_id,
        limit: 1
      },
      headers: this.headers,
      timeout: 8000
    });
    return Array.isArray(response.data) ? response.data[0] || null : null;
  }

  async listBusinessObjects(input) {
    const identity = conversationIdentity(input);
    const response = await this.http.get(this.url + "/rest/v1/conversation_business_objects", {
      params: {
        select: "contract_version,tenant_id,conversation_id,channel,object_type,object_id,object_status,value_status,amount_minor,currency,is_primary,source_event_id,occurred_at,metadata,updated_at",
        tenant_id: "eq." + identity.tenant_id,
        channel: "eq." + identity.channel,
        conversation_id: "eq." + identity.conversation_id,
        order: "occurred_at.desc"
      }, headers: this.headers, timeout: 8000
    });
    return Array.isArray(response.data) ? response.data : [];
  }

  async listBotOpsFindings(input) {
    const identity = conversationIdentity(input);
    const response = await this.http.get(this.url + "/rest/v1/bot_ops_findings", {
      params: {
        select: "id,bot_id,channel,category,severity,status,title,requires_approval,first_seen_at,last_seen_at,resolved_at,occurrence_count",
        tenant_id: "eq." + identity.tenant_id,
        conversation_key: "eq." + botOpsConversationKey(identity),
        order: "last_seen_at.desc",
        limit: 100
      }, headers: this.headers, timeout: 8000
    });
    return Array.isArray(response.data) ? response.data : [];
  }

  async loadMessages(identity, options) {
    if (typeof this.messages !== "function") throw new ConversationIntelligenceError("message_loader_required", "Full messages require the existing encrypted conversation log loader.", 500);
    return this.messages(conversationIdentity(identity), options || {});
  }
}

function createConversationIntelligenceService(options) {
  options = options || {};
  const store = options.store || new InMemoryConversationIntelligenceStore();

  async function upsertSummary(input) {
    return store.upsertSummary(normalizeConversationSummary(input, { now: options.now }));
  }

  async function linkBusinessObject(input) {
    return store.upsertBusinessObject(normalizeBusinessObject(input, { now: options.now }));
  }

  async function listSummaries(targetTenantId, query) {
    return store.listSummaries(targetTenantId, query || {});
  }

  async function getDetail(targetTenantId, input, query) {
    const identity = conversationIdentity(Object.assign({}, input, { tenant_id: targetTenantId }));
    const conversation = await store.getConversation(identity);
    if (!conversation) throw new ConversationIntelligenceError("conversation_not_found", "Conversation not found in this tenant.", 404);
    const results = await Promise.all([
      store.listBusinessObjects(identity),
      store.listBotOpsFindings(identity),
      store.loadMessages(identity, normalizeDetailPageQuery(query))
    ]);
    return {
      contract_version: CONTRACT_VERSION,
      conversation,
      business_objects: results[0],
      bot_ops_findings: results[1],
      messages: results[2]
    };
  }

  return { upsertSummary, linkBusinessObject, listSummaries, getDetail };
}

module.exports = {
  BUSINESS_OBJECT_TYPES,
  CONTRACT_VERSION,
  CONVERSATION_STATUSES,
  ConversationIntelligenceError,
  InMemoryConversationIntelligenceStore,
  MESSAGE_DIRECTIONS,
  OUTCOME_TYPES,
  SupabaseConversationIntelligenceStore,
  VALUE_STATUSES,
  botOpsConversationKey,
  businessObjectFromAppointment,
  businessObjectFromOrder,
  canTransitionValue,
  conversationIdentity,
  conversationIdentityKey,
  createConversationIntelligenceService,
  normalizeBusinessObject,
  normalizeConversationSummary,
  normalizeDetailPageQuery,
  valueStatusForAppointment,
  valueStatusForOrder
};
