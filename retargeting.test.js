const assert = require("assert");
const {
  AUTOMATIC_MODE_ENABLED,
  REAL_SENDS_ENABLED,
  MemoryRetargetingStore,
  RetargetingEngine,
  adjustToSendWindow,
  isStopMessage,
  normalizePolicy
} = require("./retargeting");

function clock(value) {
  let current = new Date(value);
  return {
    now: function () { return new Date(current); },
    set: function (next) { current = new Date(next); }
  };
}

function consentInput(overrides) {
  return Object.assign({
    tenant_id: "tenant-a",
    customer_id: "wa:573001112233",
    category: "marketing",
    granted: true,
    proof_id: "crm-consent-001",
    proof_type: "checkbox",
    granted_at: "2026-07-17T13:00:00.000Z",
    expires_at: "2027-07-17T13:00:00.000Z",
    actor: "admin"
  }, overrides || {});
}

function jobInput(overrides) {
  return Object.assign({
    tenant_id: "tenant-a",
    customer_id: "wa:573001112233",
    channel: "whatsapp",
    channel_tenant_id: "tenant-a",
    event_type: "high_intent",
    source_event_id: "conversation-turn-001",
    source_at: "2026-07-17T13:00:00.000Z",
    last_customer_message_at: "2026-07-17T13:00:00.000Z",
    context: { preferred_name: "Ana", product_name: "Carro eléctrico" },
    actor: "system"
  }, overrides || {});
}

(async function () {
  assert.strictEqual(REAL_SENDS_ENABLED, false);
  assert.strictEqual(AUTOMATIC_MODE_ENABLED, false);
  assert.strictEqual(isStopMessage("Por favor no me escriban más"), true);
  assert.strictEqual(isStopMessage("Quiero más información"), false);

  const guarded = normalizePolicy({
    mode: "manual",
    max_marketing_messages_7d: 99,
    send_window_start: "05:00",
    send_window_end: "23:00"
  });
  assert.strictEqual(guarded.max_marketing_messages_7d, 2);
  assert.strictEqual(guarded.send_window_start, "09:00");
  assert.strictEqual(guarded.send_window_end, "19:00");
  assert.strictEqual(adjustToSendWindow("2026-07-18T01:30:00.000Z", guarded), "2026-07-18T14:00:00.000Z");

  const fake = clock("2026-07-17T14:00:00.000Z");
  const store = new MemoryRetargetingStore();
  const engine = new RetargetingEngine({ store, now: fake.now });
  await engine.recordConsent(consentInput());

  const simulation = await engine.createJob(jobInput(), { mode: "simulation", high_intent_delay_hours: 1 });
  assert.strictEqual(simulation.created, true);
  assert.strictEqual(simulation.job.status, "simulation_pending");
  assert(simulation.job.preview.includes("SALIR"));

  const duplicate = await engine.createJob(jobInput(), { mode: "simulation", high_intent_delay_hours: 1 });
  assert.strictEqual(duplicate.idempotent, true);
  assert.strictEqual((await engine.snapshot("tenant-a")).jobs.length, 1);

  fake.set("2026-07-17T15:00:00.000Z");
  const simulationRun = await engine.runWorker("tenant-a");
  assert.strictEqual(simulationRun.simulated, 1);
  assert.strictEqual(simulationRun.real_messages_sent, 0);
  assert.strictEqual((await engine.snapshot("tenant-a")).jobs[0].status, "simulated");

  const cart = await engine.createJob(jobInput({
    event_type: "abandoned_cart",
    source_event_id: "cart-002",
    source_at: "2026-07-16T14:00:00.000Z",
    last_customer_message_at: "2026-07-16T14:00:00.000Z",
    template: { name: "abandoned_cart_rav", language: "es", status: "approved", active: true }
  }), { mode: "manual", abandoned_cart_delay_hours: 24 });
  assert.strictEqual(cart.job.status, "pending_approval");
  const approved = await engine.approveJob("tenant-a", cart.job.id, "admin@example.com");
  assert.strictEqual(approved.status, "approved");
  const manualRun = await engine.runWorker("tenant-a");
  assert.strictEqual(manualRun.blocked, 1);
  assert.strictEqual(manualRun.real_messages_sent, 0);
  const blockedManual = (await engine.snapshot("tenant-a")).jobs.find(job => job.id === cart.job.id);
  assert.strictEqual(blockedManual.reason, "real_sends_disabled");

  const replyJob = await engine.createJob(jobInput({ source_event_id: "reply-cancel-003", source_at: "2026-07-17T15:00:00.000Z" }), { mode: "manual", high_intent_delay_hours: 2 });
  await engine.recordCustomerSignal({ tenant_id: "tenant-a", customer_id: replyJob.job.customer_id, signal: "customer_replied", source_event_id: "incoming-004" });
  const cancelledReply = (await engine.snapshot("tenant-a")).jobs.find(job => job.id === replyJob.job.id);
  assert.strictEqual(cancelledReply.status, "cancelled");
  assert.strictEqual(cancelledReply.reason, "customer_replied");

  const purchaseJob = await engine.createJob(jobInput({ source_event_id: "purchase-cancel-005", source_at: "2026-07-17T15:00:00.000Z" }), { mode: "manual" });
  await engine.recordCustomerSignal({ tenant_id: "tenant-a", customer_id: purchaseJob.job.customer_id, signal: "purchase_confirmed", source_event_id: "shopify-order-1" });
  assert.strictEqual((await engine.snapshot("tenant-a")).jobs.find(job => job.id === purchaseJob.job.id).reason, "purchase_confirmed");

  await engine.recordConsent(consentInput({ granted: false, revoked_at: "2026-07-17T15:05:00.000Z" }));
  const afterStop = await engine.createJob(jobInput({ source_event_id: "after-stop-006", source_at: "2026-07-17T15:06:00.000Z" }), { mode: "manual" });
  assert.strictEqual(afterStop.job.status, "blocked");
  assert(afterStop.job.blockers.includes("consent_revoked"));

  const stopEngine = new RetargetingEngine({ store: new MemoryRetargetingStore(), now: fake.now });
  await stopEngine.recordConsent(consentInput({ tenant_id: "tenant-stop", customer_id: "wa:stop", category: "cart", proof_id: "cart-proof" }));
  await stopEngine.recordCustomerSignal({ tenant_id: "tenant-stop", customer_id: "wa:stop", signal: "stop", source_event_id: "stop-global" });
  const stoppedCart = await stopEngine.createJob(jobInput({
    tenant_id: "tenant-stop",
    customer_id: "wa:stop",
    channel_tenant_id: "tenant-stop",
    event_type: "abandoned_cart",
    source_event_id: "cart-after-stop",
    source_at: "2026-07-17T15:01:00.000Z",
    template: { name: "abandoned_cart_rav", status: "approved", active: true, quality: "active" }
  }), { mode: "manual" });
  assert(stoppedCart.job.blockers.includes("customer_event_stop"));

  const otherTenant = new RetargetingEngine({ store: new MemoryRetargetingStore(), now: fake.now });
  await otherTenant.recordConsent(consentInput({ tenant_id: "tenant-b", customer_id: "wa:2" }));
  await otherTenant.pauseTenant("tenant-b", "super-admin", "maintenance");
  const pausedJob = await otherTenant.createJob(jobInput({ tenant_id: "tenant-b", customer_id: "wa:2", channel_tenant_id: "tenant-b", source_event_id: "paused-1" }), { mode: "simulation" });
  assert.strictEqual(pausedJob.job.status, "blocked");
  assert(pausedJob.job.blockers.includes("tenant_paused"));

  const automatic = await otherTenant.createJob(jobInput({ tenant_id: "tenant-b", customer_id: "wa:2", channel_tenant_id: "tenant-b", source_event_id: "auto-2" }), { mode: "automatic" });
  assert.strictEqual(automatic.job.status, "blocked");
  assert(automatic.job.blockers.includes("automatic_mode_not_enabled"));

  const frequencyEngine = new RetargetingEngine({ store: new MemoryRetargetingStore(), now: fake.now });
  await frequencyEngine.recordConsent(consentInput({ tenant_id: "tenant-frequency", customer_id: "wa:3" }));
  for (const sourceEventId of ["sent-1", "sent-2"]) {
    const created = await frequencyEngine.createJob(jobInput({
      tenant_id: "tenant-frequency",
      customer_id: "wa:3",
      channel_tenant_id: "tenant-frequency",
      source_event_id: sourceEventId,
      source_at: "2026-07-17T14:00:00.000Z"
    }), { mode: "manual", high_intent_delay_hours: 1 });
    await frequencyEngine.transition("tenant-frequency", created.job, { status: "sent", sent_at: "2026-07-17T15:00:00.000Z" }, "test", "seed_sent");
  }
  const third = await frequencyEngine.createJob(jobInput({
    tenant_id: "tenant-frequency",
    customer_id: "wa:3",
    channel_tenant_id: "tenant-frequency",
    source_event_id: "sent-3",
    source_at: "2026-07-17T15:00:00.000Z"
  }), { mode: "manual", max_marketing_messages_7d: 99 });
  assert.strictEqual(third.job.status, "blocked");
  assert(third.job.blockers.includes("marketing_frequency_limit_7d"));

  const templateEngine = new RetargetingEngine({ store: new MemoryRetargetingStore(), now: fake.now });
  await templateEngine.recordConsent(consentInput({ tenant_id: "tenant-template", customer_id: "wa:4" }));
  await templateEngine.recordTemplateStatus({ tenant_id: "tenant-template", name: "abandoned_cart_rav", status: "approved", active: true, quality: "active" });
  const templated = await templateEngine.createJob(jobInput({
    tenant_id: "tenant-template",
    customer_id: "wa:4",
    channel_tenant_id: "tenant-template",
    event_type: "abandoned_cart",
    source_event_id: "template-1",
    source_at: "2026-07-16T14:00:00.000Z"
  }), { mode: "manual", abandoned_cart_delay_hours: 24 });
  assert.strictEqual(templated.job.status, "pending_approval");
  const degradation = await templateEngine.recordTemplateStatus({ tenant_id: "tenant-template", name: "abandoned_cart_rav", status: "approved", active: false, quality: "paused" });
  assert.deepStrictEqual(degradation.cancelled, [templated.job.id]);
  assert.strictEqual((await templateEngine.snapshot("tenant-template")).jobs[0].status, "cancelled");

  console.log("retargeting unit tests: ok");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
