"use strict";

const assert = require("assert");
const {
  InMemoryMetaWebhookInboxStore,
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

  console.log("meta-webhook-inbox.test.js: ok");
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
