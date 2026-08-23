"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  CONTRACT_VERSION,
  ConversationIntelligenceError,
  InMemoryConversationIntelligenceStore,
  VALUE_STATUSES,
  botOpsConversationKey,
  businessObjectFromAppointment,
  businessObjectFromOrder,
  canTransitionValue,
  createConversationIntelligenceService,
  normalizeBusinessObject,
  normalizeConversationSummary,
  normalizeDetailPageQuery
} = require("./conversation-intelligence");

const NOW = "2026-08-22T12:00:00.000Z";

assert.strictEqual(CONTRACT_VERSION, 1);
assert.deepStrictEqual(VALUE_STATUSES, ["potential", "confirmed", "paid", "lost", "cancelled"]);

const identity = { tenant_id: "Tenant-A", channel: "WhatsApp", conversation_id: "wa:573001112233" };
const expectedBotOpsKey = crypto.createHash("sha256")
  .update("tenant-a\u001fwhatsapp\u001fwa:573001112233")
  .digest("hex");
assert.strictEqual(botOpsConversationKey(identity), expectedBotOpsKey,
  "Conversation Intelligence and Bot Ops must use the same privacy-safe conversation key");

const normalized = normalizeConversationSummary(Object.assign({}, identity, {
  primary_bot_id: "customer_service",
  active_bot_id: "appointments",
  outcome_type: "appointment",
  outcome_status: "confirmed",
  message_count: 12,
  last_message_preview: "A".repeat(300),
  last_message_direction: "customer",
  first_message_at: "2026-08-22T11:00:00.000Z",
  last_message_at: NOW,
  messages: [{ text: "must never enter a summary" }]
}), { now: NOW });
assert.strictEqual(normalized.tenant_id, "tenant-a");
assert.strictEqual(normalized.channel, "whatsapp");
assert.strictEqual(normalized.last_message_preview.length, 240);
assert.strictEqual(Object.prototype.hasOwnProperty.call(normalized, "messages"), false,
  "summary contract must never carry full messages");
assert.throws(function () {
  normalizeConversationSummary(Object.assign({}, identity, {
    primary_bot_id: "customer_service", bot_ops_conversation_key: "a".repeat(64)
  }));
}, function (error) { return error.code === "bot_ops_conversation_key_mismatch"; });
assert.throws(function () {
  normalizeConversationSummary(identity);
}, function (error) { return error.code === "primary_bot_id_required"; });
assert.throws(function () {
  normalizeConversationSummary({ tenant_id: "tenant-a", channel: "whatsapp" });
}, function (error) { return error instanceof ConversationIntelligenceError && error.code === "conversation_id_required"; });

assert.strictEqual(canTransitionValue(null, "potential"), true);
assert.strictEqual(canTransitionValue("potential", "confirmed"), true);
assert.strictEqual(canTransitionValue("confirmed", "paid"), true);
assert.strictEqual(canTransitionValue("paid", "cancelled"), true);
assert.strictEqual(canTransitionValue("paid", "potential"), false);
assert.strictEqual(canTransitionValue("lost", "confirmed"), true);
assert.strictEqual(canTransitionValue("cancelled", "confirmed"), true);
assert.strictEqual(canTransitionValue("cancelled", "paid"), false);
assert.deepStrictEqual(normalizeDetailPageQuery({ limit: 999, before_message_at: NOW }), {
  limit: 200, before_message_at: NOW, before_message_id: null
});

assert.throws(function () {
  normalizeBusinessObject(Object.assign({}, identity, {
    object_type: "order", object_id: "ord-1", value_status: "paid",
    amount_minor: 10000, source_event_id: "order:ord-1:paid"
  }));
}, function (error) { return error.code === "currency_required"; });

const appointmentLink = businessObjectFromAppointment({
  tenant_id: "tenant-a",
  appointment_id: "appt-1",
  customer_conversation_id: "wa:573001112233",
  channel: "whatsapp",
  status: "booked",
  updated_at: NOW
});
assert.strictEqual(appointmentLink.object_type, "appointment");
assert.strictEqual(appointmentLink.value_status, "confirmed");
assert.strictEqual(appointmentLink.conversation_id, "wa:573001112233");
assert.throws(function () {
  businessObjectFromAppointment({
    tenant_id: "tenant-a", appointment_id: "appt-voice", conversation_id: "elevenlabs-provider-call",
    channel: "voice", status: "booked", updated_at: NOW
  });
}, function (error) { return error.code === "customer_conversation_id_required"; },
"a voice provider ID must never be presented as a customer conversation");

const orderLink = businessObjectFromOrder({
  id: "ord-1",
  tenant_id: "tenant-a",
  conversation_id: "wa:573001112233",
  channel: "whatsapp",
  stage: "pagado",
  total: 189900,
  currency: "COP",
  revision: 2,
  updated_at: NOW
});
assert.strictEqual(orderLink.object_type, "order");
assert.strictEqual(orderLink.value_status, "paid");
assert.strictEqual(orderLink.amount_minor, 189900);

(async function () {
  let messageLoads = 0;
  const store = new InMemoryConversationIntelligenceStore({
    loadMessages: async function (requestedIdentity) {
      messageLoads++;
      return [{ id: 1, tenant_id: requestedIdentity.tenant_id, text: "loaded on open only" }];
    }
  });
  const service = createConversationIntelligenceService({ store, now: NOW });

  await service.upsertSummary(Object.assign({}, identity, {
    primary_bot_id: "customer_service",
    active_bot_id: "customer_service",
    message_count: 2,
    first_message_at: "2026-08-22T11:50:00.000Z",
    last_message_at: NOW,
    last_message_preview: "Quiero agendar una cita",
    last_message_direction: "customer"
  }));
  await service.upsertSummary({
    tenant_id: "tenant-b", channel: "whatsapp", conversation_id: "wa:573001112233",
    primary_bot_id: "customer_service", message_count: 1, last_message_at: NOW
  });

  const tenantA = await service.listSummaries("tenant-a", { limit: 50 });
  assert.strictEqual(tenantA.length, 1);
  assert(tenantA.every(function (row) { return row.tenant_id === "tenant-a"; }));
  assert.strictEqual(messageLoads, 0, "summary list must not load conversation_logs");
  assert.strictEqual(Object.prototype.hasOwnProperty.call(tenantA[0], "messages"), false);

  await service.linkBusinessObject(appointmentLink);
  await service.linkBusinessObject(orderLink);
  const afterOrder = (await service.listSummaries("tenant-a", { limit: 50 }))[0];
  assert.strictEqual(afterOrder.outcome_type, "mixed");
  assert.strictEqual(afterOrder.outcome_status, "paid");
  assert.strictEqual(afterOrder.appointment_count, 1);
  assert.strictEqual(afterOrder.order_count, 1);
  assert.strictEqual(afterOrder.paid_value_minor, 189900);

  const detail = await service.getDetail("tenant-a", { channel: "whatsapp", conversation_id: "wa:573001112233" });
  assert.strictEqual(messageLoads, 1, "messages are loaded only when one conversation is opened");
  assert.strictEqual(detail.messages.length, 1);
  assert.strictEqual(detail.business_objects.length, 2);

  await assert.rejects(function () {
    return service.getDetail("tenant-c", { channel: "whatsapp", conversation_id: "wa:573001112233" });
  }, function (error) { return error.code === "conversation_not_found" && error.status === 404; });

  await service.upsertSummary({
    tenant_id: "tenant-a", channel: "instagram", conversation_id: "ig:client-9",
    primary_bot_id: "customer_service", last_message_at: NOW
  });
  await assert.rejects(function () {
    return service.linkBusinessObject(Object.assign({}, orderLink, {
      conversation_id: "ig:client-9", channel: "instagram", source_event_id: "order:ord-1:move"
    }));
  }, function (error) { return error.code === "business_object_reassignment_blocked" && error.status === 409; });

  await assert.rejects(function () {
    return service.linkBusinessObject(Object.assign({}, orderLink, {
      value_status: "potential", source_event_id: "order:ord-1:regression", occurred_at: "2026-08-22T13:00:00.000Z"
    }));
  }, function (error) { return error.code === "value_transition_invalid" && error.status === 409; });

  const delayed = await service.linkBusinessObject(Object.assign({}, orderLink, {
    value_status: "potential", source_event_id: "order:ord-1:delayed", occurred_at: "2026-08-22T11:00:00.000Z"
  }));
  assert.strictEqual(delayed.value_status, "paid", "delayed older events are ignored instead of regressing current value");

  const up = fs.readFileSync(path.join(__dirname, "docs/migrations/20260822_conversation_intelligence_v1_up.sql"), "utf8");
  const down = fs.readFileSync(path.join(__dirname, "docs/migrations/20260822_conversation_intelligence_v1_down.sql"), "utf8");
  [
    /create table if not exists public\.conversation_intelligence/i,
    /create table if not exists public\.conversation_business_objects/i,
    /foreign key \(tenant_id, channel, conversation_id\)/i,
    /references public\.tenants\(id\) on delete restrict/i,
    /force row level security/i,
    /from public\.bot_ops_findings/i,
    /potential_value_minor/i,
    /confirmed_value_minor/i,
    /paid_value_minor/i,
    /lost_cancelled_count/i,
    /p_before_activity timestamptz/i,
    /limit v_limit/i,
    /conversation_business_object_reassignment_blocked/i,
    /grant execute .* to service_role/i
  ].forEach(function (pattern) { assert.match(up, pattern); });
  const summaryFunction = /create or replace function public\.list_conversation_intelligence_summaries_v1[\s\S]*?end;\n\$\$;/.exec(up);
  assert(summaryFunction, "summary RPC is required");
  assert.doesNotMatch(summaryFunction[0], /user_message|bot_reply|payload_ciphertext/i,
    "summary RPC must never download full message or encrypted payload columns");
  assert.match(down, /rollback blocked: export or preserve existing rows first/i);

  console.log("conversation intelligence tests: ok");
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
