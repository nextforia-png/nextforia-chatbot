"use strict";

const assert = require("assert");
const {
  InMemoryPaymentStore,
  PaymentError,
  createPaymentService,
  eventChecksum,
  feeBreakdown,
  integritySignature,
  validateWompiEvent
} = require("./payments");

const fixedNow = new Date("2026-07-25T15:00:00.000Z");
const store = new InMemoryPaymentStore({ now: function () { return new Date(fixedNow); } });
const catalogService = {
  async activeCatalogs() {
    return {
      plans: [
        {
          id: "growth",
          nombre: "Growth",
          bot_id: "atencion-cliente",
          precio_setup: 300000,
          precio_mensual: 180000
        },
        {
          id: "agenda",
          nombre: "Agenda",
          bot_id: "agendamiento",
          precio_setup: 250000,
          precio_mensual: 150000
        }
      ],
      bots: [
        { id: "atencion-cliente", nombre: "Atención al cliente" },
        { id: "agendamiento", nombre: "Agendamiento" }
      ]
    };
  }
};
const service = createPaymentService({
  store,
  catalogService,
  publicKey: "pub_test_nextforia",
  integritySecret: "test_integrity_nextforia",
  eventSecret: "test_events_nextforia",
  estimatedFeeRate: 0.029,
  publicBaseUrl: "https://staging.nextforia.example",
  now: function () { return new Date(fixedNow); }
});

function signedEvent(transaction, timestamp) {
  const event = {
    event: "transaction.updated",
    data: { transaction },
    environment: "test",
    signature: {
      properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
      checksum: ""
    },
    timestamp: timestamp || 1753455600,
    sent_at: "2026-07-25T15:00:05.000Z"
  };
  event.signature.checksum = eventChecksum(event, "test_events_nextforia");
  return event;
}

(async function run() {
  const contractA = await service.prepareContract({
    tenant_id: "tenant-a",
    customer: "Customer A",
    customer_email: "a@example.com",
    plan_id: "growth",
    bot_id: "atencion-cliente"
  });
  assert.strictEqual(contractA.contracted_setup_price, 0);
  assert.strictEqual(contractA.contracted_monthly_price, 180000);
  assert.strictEqual(contractA.payment_provider, "wompi");
  assert.strictEqual(contractA.ready_for_bot_creation, false);

  const checkoutA = await service.startCheckout({
    tenant_id: "tenant-a",
    customer: "Customer A",
    customer_email: "a@example.com",
    plan_id: "growth",
    bot_id: "atencion-cliente",
    actor: "a@example.com"
  });
  assert.strictEqual(checkoutA.environment, "test");
  assert.strictEqual(checkoutA.amount_charged, 180000);
  assert(checkoutA.checkout_url.startsWith("https://checkout.wompi.co/p/?"));
  assert(checkoutA.checkout_url.includes("public-key=pub_test_nextforia"));
  assert(!checkoutA.checkout_url.includes("test_integrity_nextforia"));
  assert.strictEqual((await service.tenantBilling("tenant-a")).payment_status, "pending");
  assert.strictEqual((await service.tenantBilling("tenant-a")).ready_for_bot_creation, false,
    "browser checkout creation must never activate billing");

  const approvedEvent = signedEvent({
    id: "wompi-approved-a",
    reference: checkoutA.reference,
    status: "APPROVED",
    amount_in_cents: 18000000,
    created_at: "2026-07-25T15:00:02.000Z",
    finalized_at: "2026-07-25T15:00:04.000Z"
  });
  const approved = await service.processWebhook(approvedEvent, approvedEvent.signature.checksum);
  assert.strictEqual(approved.duplicate, false);
  let billingA = await service.tenantBilling("tenant-a");
  assert.strictEqual(billingA.payment_status, "paid");
  assert.strictEqual(billingA.subscription_status, "active");
  assert.strictEqual(billingA.ready_for_bot_creation, true);
  assert.strictEqual(billingA.provider_fee, 5220);
  assert.strictEqual(billingA.provider_fee_type, "estimated");
  assert.strictEqual(billingA.net_amount, 174780);
  assert.strictEqual(billingA.history.length, 1);

  const repeated = await service.processWebhook(approvedEvent, approvedEvent.signature.checksum);
  assert.strictEqual(repeated.duplicate, true);
  assert.strictEqual((await service.tenantBilling("tenant-a")).history.length, 1,
    "repeated webhooks must not duplicate payment history");
  const lateFailure = signedEvent(Object.assign({}, approvedEvent.data.transaction, {
    status: "DECLINED"
  }), 1753455650);
  const ignoredFailure = await service.processWebhook(lateFailure, lateFailure.signature.checksum);
  assert.strictEqual(ignoredFailure.ignored, true);
  assert.strictEqual((await service.tenantBilling("tenant-a")).payment_status, "paid",
    "a late failed event must not regress an approved payment");
  await assert.rejects(service.startCheckout({
    tenant_id: "tenant-a",
    customer: "Customer A",
    plan_id: "growth",
    bot_id: "atencion-cliente"
  }), function (error) {
    return error instanceof PaymentError && error.code === "subscription_already_ready";
  });

  await service.prepareContract({
    tenant_id: "tenant-b",
    customer: "Customer B",
    plan_id: "agenda",
    bot_id: "agendamiento"
  });
  const checkoutB = await service.startCheckout({
    tenant_id: "tenant-b",
    customer: "Customer B",
    plan_id: "agenda",
    bot_id: "agendamiento"
  });
  const failedEvent = signedEvent({
    id: "wompi-failed-b",
    reference: checkoutB.reference,
    status: "DECLINED",
    amount_in_cents: 15000000,
    created_at: "2026-07-25T15:10:00.000Z"
  }, 1753456200);
  const wrongAmountEvent = signedEvent(Object.assign({}, failedEvent.data.transaction, {
    amount_in_cents: 14999900
  }), 1753456150);
  await assert.rejects(
    service.processWebhook(wrongAmountEvent, wrongAmountEvent.signature.checksum),
    function (error) {
      return error instanceof PaymentError && error.code === "payment_amount_mismatch";
    }
  );
  await service.processWebhook(failedEvent, failedEvent.signature.checksum);
  const billingB = await service.tenantBilling("tenant-b");
  assert.strictEqual(billingB.payment_status, "failed");
  assert.notStrictEqual(billingB.subscription_status, "active");
  assert.strictEqual(billingB.ready_for_bot_creation, false);
  assert.strictEqual((await service.tenantBilling("tenant-a")).tenant_id, "tenant-a");
  assert.strictEqual((await service.tenantBilling("tenant-a")).history.length, 1,
    "Customer B activity must not leak into Customer A");

  await service.prepareContract({
    tenant_id: "rav-toys",
    customer: "RAV Toys",
    plan_id: "growth",
    bot_id: "atencion-cliente"
  });
  const pilot = await service.approveBypass({
    tenant_id: "rav-toys",
    subscription_status: "pilot",
    reason: "Piloto fundador RAV Toys",
    actor: "santiago@example.com"
  });
  assert.strictEqual(pilot.subscription_status, "pilot");
  assert.strictEqual(pilot.ready_for_bot_creation, true);
  assert.strictEqual(pilot.bypass_reason, "Piloto fundador RAV Toys");

  await service.prepareContract({
    tenant_id: "tenant-trial",
    customer: "Trial Customer",
    plan_id: "agenda",
    bot_id: "agendamiento"
  });
  const trial = await service.approveBypass({
    tenant_id: "tenant-trial",
    subscription_status: "trial",
    trial_start: "2026-07-25T15:00:00.000Z",
    trial_end: "2026-08-08T15:00:00.000Z",
    reason: "Trial comercial aprobado",
    actor: "super-admin"
  });
  assert.strictEqual(trial.subscription_status, "trial");
  assert.strictEqual(trial.next_payment_date, "2026-08-08T15:00:00.000Z");

  const realFee = feeBreakdown({
    amount_in_cents: 10000000,
    fee_in_cents: 350000
  }, 0.029);
  assert.deepStrictEqual(realFee, {
    amount_charged: 100000,
    provider_fee: 3500,
    provider_fee_type: "real",
    net_amount: 96500
  });
  assert.deepStrictEqual(feeBreakdown({
    amount_in_cents: 10000000
  }, 0.0265, 700, 0.19), {
    amount_charged: 100000,
    provider_fee: 3987,
    provider_fee_type: "estimated",
    net_amount: 96013
  });

  assert.strictEqual(
    integritySignature("ref-1", 10000, "test_integrity_secret"),
    require("crypto").createHash("sha256").update("ref-1" + "10000" + "COP" + "test_integrity_secret").digest("hex")
  );

  const tampered = JSON.parse(JSON.stringify(approvedEvent));
  tampered.data.transaction.amount_in_cents += 100;
  assert.throws(function () {
    validateWompiEvent(tampered, "test_events_nextforia", approvedEvent.signature.checksum);
  }, function (error) {
    return error instanceof PaymentError && error.code === "invalid_webhook_signature";
  });

  const all = await service.adminBilling();
  assert.strictEqual(all.length, 4);
  assert(all.some(function (row) { return row.tenant_id === "rav-toys" && row.subscription_status === "pilot"; }));

  console.log("payments tests passed");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
