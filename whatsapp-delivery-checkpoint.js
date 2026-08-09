"use strict";

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max || 4096);
}

function whatsappDeliveryCheckpointDecision(error) {
  if (!error || error.whatsappDeliveryFailure !== true) return null;
  const outboundText = cleanText(error.outbound_text, 4096);
  if (error.retryable === true && outboundText) {
    return { status: "outbound_pending", outbound_text: outboundText, terminal: false };
  }
  // Media/location failures have no replayable text payload. Re-running the
  // inbound turn could duplicate tools, so fail terminally and visibly.
  error.retryable = false;
  error.permanent = true;
  return {
    status: "error",
    outbound_text: outboundText || "[Contenido multimedia no enviado]",
    terminal: true
  };
}

async function resumeWhatsAppPendingReply(receipt, hooks) {
  hooks = hooks || {};
  const outboundText = cleanText(receipt && receipt.botReply, 4096);
  if (!outboundText) throw new Error("whatsapp_pending_reply_missing_text");
  try {
    await hooks.sendText(outboundText);
  } catch (error) {
    if (error && error.whatsappDeliveryFailure && error.permanent === true) {
      await hooks.persistResult("error");
    }
    throw error;
  }
  await hooks.persistResult("ok");
  if (receipt && receipt.handoff === true && typeof hooks.activateHandoff === "function") {
    await hooks.activateHandoff();
  }
  return { resumed: true, status: "ok", outbound_text: outboundText };
}

module.exports = {
  resumeWhatsAppPendingReply,
  whatsappDeliveryCheckpointDecision
};
