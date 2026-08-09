"use strict";

const assert = require("assert");
const {
  InMemoryMetaWebhookInboxStore,
  SupabaseMetaWebhookInboxStore,
  createMetaWebhookInbox,
  extractWhatsAppMessageEvents
} = require("./meta-webhook-inbox");

(async function run() {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      { changes: [{ value: {
        metadata: { phone_number_id: "phone-1" },
        messages: [
          { id: "wamid.1", from: "sender-a", type: "text", text: { body: "uno" } },
          { id: "wamid.2", from: "sender-a", type: "text", text: { body: "dos" } }
        ]
      } }] },
      { changes: [
        { field: "statuses", value: { metadata: { phone_number_id: "phone-1" }, statuses: [{ id: "status-only" }] } },
        { value: {
          metadata: { phone_number_id: "phone-2" },
          messages: [{ id: "wamid.3", from: "sender-b", type: "text", text: { body: "tres" } }]
        } }
      ] }
    ]
  };
  const events = extractWhatsAppMessageEvents(payload);
  assert.deepStrictEqual(events.map(function (event) { return event.event_id; }), [
    "whatsapp:wamid.1",
    "whatsapp:wamid.2",
    "whatsapp:wamid.3"
  ]);
  assert.strictEqual(extractWhatsAppMessageEvents({ object: "page", entry: [] }).length, 0);

  let now = new Date("2026-08-08T12:00:00.000Z");
  const store = new InMemoryMetaWebhookInboxStore({ clock: function () { return new Date(now); } });
  events.forEach(function (event, index) {
    event.received_at = new Date(now.getTime() + index).toISOString();
  });
  let result = await store.enqueue(events);
  assert.deepStrictEqual(result, { accepted: 3, inserted: 3 });
  result = await store.enqueue(events);
  assert.deepStrictEqual(result, { accepted: 3, inserted: 0 }, "duplicate delivery must be idempotent");

  const first = await store.claim("worker-a", 180);
  assert.strictEqual(first.event_id, "whatsapp:wamid.1");
  const parallel = await store.claim("worker-b", 180);
  assert.strictEqual(parallel.event_id, "whatsapp:wamid.3", "a different sender may progress in parallel");
  assert.strictEqual(await store.complete(first.event_id, "wrong-worker", {}), false);
  assert.strictEqual(await store.complete(first.event_id, "worker-a", { tenant_id: "tenant-a" }), true);
  const orderedSecond = await store.claim("worker-a", 180);
  assert.strictEqual(orderedSecond.event_id, "whatsapp:wamid.2", "same-sender order must be preserved");

  now = new Date(now.getTime() + 181000);
  const recovered = await store.claim("worker-c", 180);
  assert.strictEqual(recovered.event_id, "whatsapp:wamid.2", "expired processing lease must survive a crash");
  assert.strictEqual(await store.complete(recovered.event_id, "worker-a", {}), false, "old owner cannot complete");
  assert.strictEqual(await store.complete(recovered.event_id, "worker-c", { tenant_id: "tenant-a" }), true);
  assert.strictEqual(await store.complete(parallel.event_id, "worker-b", { tenant_id: "tenant-b" }), true);

  const retryEvent = extractWhatsAppMessageEvents({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "phone-3" },
      messages: [{ id: "wamid.retry", from: "sender-c", type: "text", text: { body: "retry" } }]
    } }] }]
  })[0];
  retryEvent.received_at = now.toISOString();
  await store.enqueue([retryEvent]);
  let attempts = 0;
  const inbox = createMetaWebhookInbox({
    store,
    owner: "worker-test",
    interval_ms: 60000,
    processEvent: async function () {
      attempts++;
      if (attempts === 1) throw new Error("transient");
      return { tenant_id: "tenant-c" };
    }
  });
  await inbox.drain();
  let retryRow = (await store.list()).find(function (row) { return row.event_id === retryEvent.event_id; });
  assert.strictEqual(retryRow.status, "pending");
  assert.strictEqual(attempts, 1);
  now = new Date(now.getTime() + 2000);
  await inbox.drain();
  retryRow = (await store.list()).find(function (row) { return row.event_id === retryEvent.event_id; });
  assert.strictEqual(retryRow.status, "completed");
  assert.strictEqual(retryRow.tenant_id, "tenant-c");
  assert.strictEqual(attempts, 2);
  inbox.stop();

  const httpCalls = [];
  let claimedPayload = null;
  const http = {
    async get(url, config) {
      httpCalls.push({ method: "get", url, config });
      return { data: [] };
    },
    async post(url, body, config) {
      httpCalls.push({ method: "post", url, body, config });
      if (url.endsWith("/rpc/meta_webhook_inbox_ready_v1")) return { data: true };
      if (url.endsWith("/rpc/claim_meta_webhook_event_v1")) return { data: claimedPayload ? [claimedPayload] : [] };
      return { data: null };
    },
    async patch(url, body, config) {
      httpCalls.push({ method: "patch", url, body, config });
      return { data: [{ event_id: config.params.event_id.replace(/^eq\./, "") }] };
    }
  };
  const encrypt = function (value) { return "enc:v1:" + Buffer.from(value).toString("base64url"); };
  const decrypt = function (value) { return Buffer.from(value.slice("enc:v1:".length), "base64url").toString("utf8"); };
  const senderKey = function (value) { return "sender:" + require("crypto").createHash("sha256").update(value).digest("hex"); };
  const supabaseStore = new SupabaseMetaWebhookInboxStore({
    url: "https://supabase.example",
    headers: { apikey: "test-key" },
    axiosClient: http,
    encrypt,
    decrypt,
    senderKey,
    clock: function () { return new Date(now); }
  });

  await supabaseStore.assertReady({ force: true });
  assert(httpCalls.some(function (call) { return call.method === "get" && call.url.endsWith("/meta_webhook_events"); }));
  assert(httpCalls.some(function (call) { return call.method === "post" && call.url.endsWith("/rpc/meta_webhook_inbox_ready_v1"); }));

  const productionEvent = extractWhatsAppMessageEvents({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "phone-production" },
      messages: [{ id: "wamid.production", from: "sender-production", type: "text", text: { body: "hola" } }]
    } }] }]
  })[0];
  productionEvent.received_at = now.toISOString();
  const enqueueResult = await supabaseStore.enqueue([productionEvent]);
  assert.deepStrictEqual(enqueueResult, { accepted: 1, inserted: null });
  const insertCall = httpCalls.find(function (call) {
    return call.method === "post" && call.url.includes("meta_webhook_events?on_conflict=event_id");
  });
  assert(insertCall, "production adapter must insert into the durable inbox");
  assert.strictEqual(insertCall.config.headers.Prefer, "resolution=ignore-duplicates,return=minimal");
  assert.strictEqual(insertCall.body[0].event_id, "whatsapp:wamid.production");
  assert(insertCall.body[0].payload_ciphertext.startsWith("enc:v1:"));
  assert(!JSON.stringify(insertCall.body[0]).includes("sender-production"), "sender must not be stored in clear text");

  claimedPayload = Object.assign({}, insertCall.body[0], {
    queue_id: 99,
    status: "processing",
    attempts: 1,
    lease_owner: "worker-production"
  });
  const productionClaim = await supabaseStore.claim("worker-production", 120);
  assert.strictEqual(productionClaim.event_id, "whatsapp:wamid.production");
  assert.strictEqual(productionClaim.payload.message.text.body, "hola");
  assert.strictEqual(await supabaseStore.heartbeat(productionClaim.event_id, "worker-production", 180), true);
  assert.strictEqual(await supabaseStore.complete(productionClaim.event_id, "worker-production", { tenant_id: "tenant-production" }), true);
  const completion = httpCalls.filter(function (call) { return call.method === "patch"; }).pop();
  assert.strictEqual(completion.body.status, "completed");
  assert.strictEqual(completion.body.tenant_id, "tenant-production");
  assert.strictEqual(completion.body.payload_ciphertext, null);

  claimedPayload = Object.assign({}, claimedPayload, { destination_id: "wrong-phone" });
  await assert.rejects(
    supabaseStore.claim("worker-production", 120),
    function (error) { return error && error.message === "meta_webhook_inbox_integrity_failed" && error.permanent === true; }
  );

  console.log("meta-webhook-inbox.test.js: ok");
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
