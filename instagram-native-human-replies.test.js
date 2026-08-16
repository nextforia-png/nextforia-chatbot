"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

(async function run() {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const start = source.indexOf("function instagramBusinessOutboundEvent");
  const end = source.indexOf("\napp.post(\"/instagram/webhook\"", start);
  assert(start >= 0 && end > start, "Instagram native reply helpers must exist");

  const calls = { runtime: [], handoff: [], signals: [], events: [], logs: [] };
  const context = {
    Date,
    Number,
    String,
    Array,
    cleanRuntimeText: function (value, max) {
      return String(value == null ? "" : value).trim().slice(0, max || 5000);
    },
    instagramRuntimeState: {
      human_outbound_messages: 0,
      last_human_outbound_at: null,
      last_skip_reason: null
    },
    rememberConversationRuntime: function (userId, destination) { calls.runtime.push({ userId, destination }); },
    addHumanHandoff: function (userId, tenantId) { calls.handoff.push({ userId, tenantId }); },
    recordRetargetingSignal: async function () { calls.signals.push(Array.from(arguments)); },
    recordAdminEvent: async function () { calls.events.push(Array.from(arguments)); },
    log: function () { calls.logs.push(Array.from(arguments)); }
  };
  vm.runInNewContext(source.slice(start, end), context);

  const destination = { tenantId: "tenant-rav", instagramUserId: "business-ig" };
  assert.strictEqual(context.instagramBusinessOutboundEvent({
    sender: { id: "business-ig" }, message: { text: "Respuesta humana" }
  }, destination), true);
  assert.strictEqual(context.instagramBusinessOutboundEvent({
    sender: { id: "customer-ig" }, message: { is_echo: true }
  }, destination), true);
  assert.strictEqual(context.instagramBusinessOutboundEvent({
    sender: { id: "customer-ig" }, message: { text: "Mensaje entrante" }
  }, destination), false);
  assert.strictEqual(context.instagramNativeReplyText({
    message: { attachments: [{ type: "image" }] }
  }), "[Imagen enviada desde Instagram]");

  const event = {
    sender: { id: "business-ig" },
    recipient: { id: "customer-ig" },
    timestamp: 1786200010000,
    message: { mid: "igmid.human-1", text: "Respuesta escrita desde Instagram" }
  };
  assert.strictEqual(await context.recordInstagramNativeHumanReply(event, destination, "igmid.human-1"), true);
  assert.deepStrictEqual(calls.handoff[0], { userId: "ig:customer-ig", tenantId: "tenant-rav" });
  assert.strictEqual(calls.events.length, 1);
  assert.strictEqual(calls.events[0][0], "ig:customer-ig");
  assert.strictEqual(calls.events[0][1], "admin_send_message");
  assert.strictEqual(calls.events[0][2], "[Humano] Respuesta escrita desde Instagram");
  assert.strictEqual(calls.events[0][4], true);
  assert.strictEqual(calls.events[0][5].tenant_id, "tenant-rav");
  assert.strictEqual(calls.events[0][5].source_event_id, "igmid.human-1");
  assert.strictEqual(calls.events[0][5].require_persistence, true);
  assert.deepStrictEqual(Array.from(calls.events[0][5].tools), ["instagram_native_echo"]);
  assert.strictEqual(context.instagramRuntimeState.human_outbound_messages, 1);

  console.log("instagram-native-human-replies.test.js: ok");
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
