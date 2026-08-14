"use strict";

const assert = require("assert");
const {
  InMemoryMetaWebhookInboxStore,
  SupabaseMetaWebhookInboxStore,
  classifyWhatsAppDeliveryError,
  createMetaWebhookInbox,
  extractWhatsAppMessageEvents,
  whatsappMessageSender,
  whatsappDeliveryFailure
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
        { field: "messages", value: { metadata: { phone_number_id: "phone-1" }, statuses: [{
          id: "wamid.outbound-1",
          status: "delivered",
          timestamp: "1786200000",
          recipient_id: "sender-a"
        }] } },
        { value: {
          metadata: { phone_number_id: "phone-2" },
          messages: [{ id: "wamid.3", from: "sender-b", type: "text", text: { body: "tres" } }]
        } }
      ] }
    ]
  };
  const events = extractWhatsAppMessageEvents(payload);
  assert.deepStrictEqual(events.slice(0, 2).map(function (event) { return event.event_id; }), [
    "whatsapp:wamid.1",
    "whatsapp:wamid.2"
  ]);
  assert.match(events[2].event_id, /^whatsapp:status:sha256:[a-f0-9]{64}$/);
  assert.strictEqual(events[2].payload.event_type, "status");
  assert.strictEqual(events[2].ordering_identity, "sender-a");
  assert.strictEqual(events[3].event_id, "whatsapp:wamid.3");
  const repeatedStatus = extractWhatsAppMessageEvents(payload)[2];
  assert.strictEqual(repeatedStatus.event_id, events[2].event_id, "status retries must be idempotent");
  assert.strictEqual(extractWhatsAppMessageEvents({ object: "page", entry: [] }).length, 0);

  const contactFallbackPayload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "phone-coexistence-customer" },
      contacts: [{ wa_id: "573001112233", profile: { name: "Cliente" } }],
      messages: [{ id: "wamid.contact-fallback", type: "text", text: { body: "Hola" } }]
    } }] }]
  };
  const contactFallbackEvent = extractWhatsAppMessageEvents(contactFallbackPayload)[0];
  assert.strictEqual(contactFallbackEvent.ordering_identity, "573001112233");
  assert.strictEqual(contactFallbackEvent.payload.message.from, "573001112233");
  assert.strictEqual(
    whatsappMessageSender(contactFallbackEvent.payload.value, { id: "stored-without-from" }),
    "573001112233",
    "durably stored coexistence events can resolve the unique contact sender"
  );
  assert.strictEqual(
    whatsappMessageSender({ contacts: [{ wa_id: "sender-a" }, { wa_id: "sender-b" }] }, {}),
    "",
    "ambiguous contact lists must never guess a sender"
  );
  const contactFallbackStore = new InMemoryMetaWebhookInboxStore();
  await contactFallbackStore.enqueue([contactFallbackEvent]);
  let processedContactSender = "";
  const contactFallbackInbox = createMetaWebhookInbox({
    store: contactFallbackStore,
    owner: "worker-contact-fallback",
    interval_ms: 60000,
    processEvent: async function (storedPayload) {
      processedContactSender = whatsappMessageSender(storedPayload.value, storedPayload.message);
      return { tenant_id: "tenant-contact-fallback" };
    }
  });
  await contactFallbackInbox.drain();
  contactFallbackInbox.stop();
  assert.strictEqual(processedContactSender, "573001112233");
  assert.strictEqual((await contactFallbackStore.list())[0].status, "completed");

  const coexistencePayload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{
      field: "smb_message_echoes",
      value: {
        metadata: { phone_number_id: "phone-coexistence" },
        message_echoes: [{
          id: "wamid.business-app-1",
          from: "573106534553",
          to: "573001112233",
          timestamp: "1786200010",
          type: "text",
          text: { body: "Respuesta escrita desde la app" }
        }]
      }
    }] }]
  };
  const coexistenceEvents = extractWhatsAppMessageEvents(coexistencePayload);
  assert.strictEqual(coexistenceEvents.length, 1);
  assert.strictEqual(coexistenceEvents[0].event_id, "whatsapp:echo:wamid.business-app-1");
  assert.strictEqual(coexistenceEvents[0].payload.event_type, "business_app_echo");
  assert.strictEqual(coexistenceEvents[0].payload.echo.to, "573001112233");
  assert.strictEqual(coexistenceEvents[0].ordering_identity, "573001112233");
  assert.strictEqual(
    extractWhatsAppMessageEvents(coexistencePayload)[0].event_id,
    coexistenceEvents[0].event_id,
    "WhatsApp Business App echo retries must be idempotent"
  );

  let now = new Date("2026-08-08T12:00:00.000Z");
  const store = new InMemoryMetaWebhookInboxStore({ clock: function () { return new Date(now); } });
  events.forEach(function (event, index) {
    event.received_at = new Date(now.getTime() + index).toISOString();
  });
  let result = await store.enqueue(events);
  assert.deepStrictEqual(result, { accepted: 4, inserted: 4 });
  result = await store.enqueue(events);
  assert.deepStrictEqual(result, { accepted: 4, inserted: 0 }, "duplicate delivery must be idempotent");

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
  const orderedStatus = await store.claim("worker-status", 180);
  assert.strictEqual(orderedStatus.event_id, events[2].event_id, "delivery status must follow earlier events for the recipient");
  assert.strictEqual(await store.complete(orderedStatus.event_id, "worker-status", { tenant_id: "tenant-a" }), true);
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

  const leaseStore = new InMemoryMetaWebhookInboxStore();
  const leaseEvent = extractWhatsAppMessageEvents({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "phone-lease" },
      messages: [{ id: "wamid.lease", from: "sender-lease", type: "text", text: { body: "lease" } }]
    } }] }]
  })[0];
  await leaseStore.enqueue([leaseEvent]);
  leaseStore.heartbeat = async function () { return false; };
  let leaseSideEffects = 0;
  const leaseInbox = createMetaWebhookInbox({
    store: leaseStore,
    owner: "worker-lost-lease",
    interval_ms: 60000,
    processEvent: async function () { leaseSideEffects++; }
  });
  await assert.rejects(
    leaseInbox.drain(),
    function (error) { return error && error.leaseLost === true && /meta_webhook_lease_lost/.test(error.message); }
  );
  assert.strictEqual(leaseSideEffects, 0, "a worker without a confirmed lease must not run side effects");
  leaseInbox.stop();

  assert.strictEqual(classifyWhatsAppDeliveryError({ code: "ECONNRESET" }).retryable, true);
  assert.strictEqual(classifyWhatsAppDeliveryError({ response: { status: 429, data: { error: { code: 4 } } } }).retryable, true);
  assert.strictEqual(classifyWhatsAppDeliveryError({ response: { status: 400, data: { error: { code: 131042 } } } }).retryable, true,
    "payment/eligibility can recover after the tenant fixes Meta billing");
  assert.strictEqual(classifyWhatsAppDeliveryError({ response: { status: 401, data: { error: { code: 190 } } } }).permanent, true);
  const definitiveDelivery = whatsappDeliveryFailure({ response: { status: 401, data: { error: { code: 190 } } } });
  assert.strictEqual(definitiveDelivery.whatsappDeliveryFailure, true);
  assert.strictEqual(definitiveDelivery.permanent, true);

  const paymentStore = new InMemoryMetaWebhookInboxStore({ clock: function () { return now; } });
  const paymentEvent = extractWhatsAppMessageEvents({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "phone-payment" },
      messages: [{ id: "wamid.payment", from: "sender-payment", type: "text", text: { body: "payment" } }]
    } }] }]
  })[0];
  await paymentStore.enqueue([paymentEvent]);
  paymentStore.rows.get(paymentEvent.event_id).attempts = 48;
  const paymentInbox = createMetaWebhookInbox({
    store: paymentStore,
    owner: "worker-payment",
    interval_ms: 60000,
    processEvent: async function () {
      throw whatsappDeliveryFailure({ response: { status: 400, data: { error: { code: 131042 } } } });
    }
  });
  await paymentInbox.drain();
  const paymentRow = paymentStore.rows.get(paymentEvent.event_id);
  assert.strictEqual(paymentRow.attempts, 49);
  assert.strictEqual(paymentRow.status, "pending", "Meta billing failures must remain recoverable beyond the old 48-attempt limit");
  paymentInbox.stop();

  const migrationSource = require("fs").readFileSync(
    require("path").join(__dirname, "docs/migrations/20260808_whatsapp_onboarding_v2_up.sql"),
    "utf8"
  );
  assert.match(migrationSource, /attempts >= 160 or received_at <= v_now - interval '72 hours'/);
  assert.match(migrationSource, /candidate\.attempts < 160/);

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
