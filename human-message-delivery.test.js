"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const renderCustomerPanel = require("./customer-panel");

function renderPanel() {
  process.env.CUSTOMER_PANEL_REDESIGN_V1_ENABLED = "true";
  let html = "";
  renderCustomerPanel({
    status: function (code) { assert.strictEqual(code, 200); return this; },
    setHeader: function () { return this; },
    send: function (value) { html = String(value); return this; }
  }, {
    auth: { name: "QA", role: "admin" },
    capabilities: { respond: true },
    initialTab: "conversations",
    demoMode: false,
    botVersion: "v-human-message-test"
  });
  return html;
}

async function flush() {
  await Promise.resolve();
  await new Promise(function (resolve) { setImmediate(resolve); });
}

(async function run() {
  const panel = renderPanel();
  const handlerRegistration = 'reply.addEventListener("keydown",conversationComposerKeydown)';
  assert.strictEqual(panel.split(handlerRegistration).length - 1, 1, "the composer must register one Enter handler");
  assert(!/id="replyText"[^>]*onkeydown=/.test(panel), "the composer must not also have an inline Enter handler");

  const clientStart = panel.indexOf("function conversationComposerKeydown");
  const clientEnd = panel.indexOf("\nfunction uiStatus", clientStart);
  assert(clientStart >= 0 && clientEnd > clientStart, "client delivery functions must render");
  const pending = [];
  const input = { value: "Mensaje único", disabled: false };
  const buttons = {
    sendBtn: { disabled: false, textContent: "Enviar" },
    sendCircleBtn: { disabled: false, textContent: "➤" }
  };
  const clientContext = {
    DEMO_MODE: false,
    JSON,
    Math,
    Promise,
    SERVER_CAPABILITIES: { respond: true },
    Date,
    api: function (path, options) {
      pending.push({ path, body: JSON.parse(options.body) });
      return new Promise(function (resolve) { pending[pending.length - 1].resolve = resolve; });
    },
    channelLabelFor: function () { return "WhatsApp"; },
    conversationKey: function () { return "wa:573000000000"; },
    document: {
      getElementById: function (id) { return id === "replyText" ? input : buttons[id] || null; }
    },
    findConversation: function () { return { id: "wa:573000000000" }; },
    loadPanelData: function () {},
    state: { selected: "wa:573000000000" },
    text: function () {},
    updateReplyCount: function () {},
    window: { crypto: { randomUUID: function () { return "11111111-1111-4111-8111-111111111111"; } } }
  };
  vm.runInNewContext(panel.slice(clientStart, clientEnd), clientContext);
  clientContext.sendReply();
  clientContext.sendReply();
  assert.strictEqual(pending.length, 1, "two simultaneous UI events must call the API once");
  assert.strictEqual(pending[0].body.clientRequestId, "11111111-1111-4111-8111-111111111111");
  pending[0].resolve({ ok: true });
  await flush();

  const serverSource = fs.readFileSync(require.resolve("./index"), "utf8");
  const serverStart = serverSource.indexOf("function executeAdminMessageDeliveryOnce");
  const serverEnd = serverSource.indexOf('\napp.post("/admin/send-message"', serverStart);
  assert(serverStart >= 0 && serverEnd > serverStart, "server idempotency function must exist");
  let deliveries = 0;
  let finishDelivery;
  const deliveryPromise = new Promise(function (resolve) { finishDelivery = resolve; });
  const serverContext = {
    ADMIN_MESSAGE_IDEMPOTENCY_TTL_MS: 600000,
    Map,
    Promise,
    adminMessageDeliveryRequests: new Map(),
    executeAdminMessageDelivery: function () { deliveries += 1; return deliveryPromise; },
    setTimeout: function () { return { unref: function () {} }; }
  };
  vm.runInNewContext(serverSource.slice(serverStart, serverEnd), serverContext);
  const tenant = { tenant_id: "tenant-a" };
  const first = serverContext.executeAdminMessageDeliveryOnce("573000000000", "Mensaje único", tenant, "QA", "request-1234");
  const repeated = serverContext.executeAdminMessageDeliveryOnce("573000000000", "Mensaje único", tenant, "QA", "request-1234");
  assert.strictEqual(deliveries, 1, "the server must execute a repeated request only once");
  assert.strictEqual(first, repeated, "the repeated request must await the original delivery result");
  finishDelivery({ status: 200, body: { ok: true } });
  assert.deepStrictEqual(await repeated, { status: 200, body: { ok: true } });

  const conflict = await serverContext.executeAdminMessageDeliveryOnce("573000000000", "Texto distinto", tenant, "QA", "request-1234");
  assert.strictEqual(conflict.status, 409, "reusing one request ID for different text must fail closed");
  console.log("human-message-delivery.test.js OK");
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
