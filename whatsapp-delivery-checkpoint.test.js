"use strict";

const assert = require("assert");
const {
  resumeWhatsAppPendingReply,
  whatsappDeliveryCheckpointDecision
} = require("./whatsapp-delivery-checkpoint");

(async function run() {
  let toolSideEffects = 0;
  let sendAttempts = 0;
  let receipt = { status: "inbound_received" };
  const metadata = {
    tools: ["book_appointment", "request_human_handoff"],
    zeroResultQueries: ["cita mañana"],
    handoff: true,
    rating: 5
  };

  async function firstAttempt() {
    toolSideEffects++;
    sendAttempts++;
    const failure = new Error("graph_unavailable");
    failure.whatsappDeliveryFailure = true;
    failure.retryable = true;
    failure.permanent = false;
    failure.outbound_text = "Tu cita quedó reservada. Te conecta el equipo.";
    const decision = whatsappDeliveryCheckpointDecision(failure);
    receipt = Object.assign({}, metadata, {
      status: decision.status,
      botReply: decision.outbound_text
    });
  }

  await firstAttempt();
  let handoffActivated = 0;
  await resumeWhatsAppPendingReply(receipt, {
    sendText: async function (text) {
      sendAttempts++;
      assert.strictEqual(text, receipt.botReply);
    },
    persistResult: async function (status) {
      receipt = Object.assign({}, receipt, { status });
    },
    activateHandoff: async function () { handoffActivated++; }
  });

  assert.strictEqual(toolSideEffects, 1, "delivery retry must not execute appointment/handoff tools twice");
  assert.strictEqual(sendAttempts, 2, "only the outbound text is attempted a second time");
  assert.strictEqual(receipt.status, "ok");
  assert.deepStrictEqual(receipt.tools, metadata.tools);
  assert.deepStrictEqual(receipt.zeroResultQueries, metadata.zeroResultQueries);
  assert.strictEqual(receipt.handoff, true);
  assert.strictEqual(receipt.rating, 5);
  assert.strictEqual(handoffActivated, 1);

  const mediaFailure = new Error("media_failed");
  mediaFailure.whatsappDeliveryFailure = true;
  mediaFailure.retryable = true;
  const mediaDecision = whatsappDeliveryCheckpointDecision(mediaFailure);
  assert.strictEqual(mediaDecision.status, "error");
  assert.strictEqual(mediaDecision.terminal, true);
  assert.strictEqual(mediaDecision.outbound_text, "[Contenido multimedia no enviado]");
  assert.strictEqual(mediaFailure.permanent, true);

  console.log("whatsapp-delivery-checkpoint.test.js: ok");
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
