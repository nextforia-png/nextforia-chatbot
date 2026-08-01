"use strict";

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isoFromWhatsAppTimestamp(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function messageText(message) {
  const type = String(message && message.type || "").toLowerCase();
  if (type === "text") return String(message && message.text && message.text.body || "").trim();
  if (type === "image") return String(message && message.image && message.image.caption || "").trim() || "[Imagen]";
  if (type === "document") return String(message && message.document && (message.document.caption || message.document.filename) || "").trim() || "[Documento]";
  if (type === "video") return String(message && message.video && message.video.caption || "").trim() || "[Video]";
  if (type === "audio" || type === "voice") return "[Audio]";
  if (type === "sticker") return "[Sticker]";
  if (type === "location") return "[Ubicación]";
  if (type === "contacts") return "[Contacto]";
  if (type === "order") return "[Pedido]";
  if (type === "interactive" || type === "button") return "[Respuesta interactiva]";
  if (type === "reaction") return String(message && message.reaction && message.reaction.emoji || "").trim() || "[Reacción]";
  if (type === "media_placeholder") return "[Archivo multimedia del historial]";
  return "[Mensaje de WhatsApp]";
}

function historyTurnsFromChange(change) {
  if (!change || change.field !== "history") return [];
  const value = change.value || {};
  const businessPhone = digits(value.metadata && value.metadata.display_phone_number);
  const turns = [];
  for (const batch of Array.isArray(value.history) ? value.history : []) {
    if (Array.isArray(batch && batch.errors) && batch.errors.length) continue;
    for (const thread of Array.isArray(batch && batch.threads) ? batch.threads : []) {
      const userId = digits(thread && thread.id);
      if (!userId) continue;
      for (const message of Array.isArray(thread && thread.messages) ? thread.messages : []) {
        const from = digits(message && message.from);
        const to = digits(message && message.to);
        const outbound = (to && to === userId) || (businessPhone && from === businessPhone) || (!!to && from !== userId);
        turns.push({
          userId,
          userMessage: outbound ? "" : messageText(message),
          botReply: outbound ? messageText(message) : "",
          sourceEventId: String(message && message.id || "").trim() || null,
          ts: isoFromWhatsAppTimestamp(message && message.timestamp),
          direction: outbound ? "outbound" : "inbound",
          status: String(message && message.history_context && message.history_context.status || "").toLowerCase() || null,
          phase: Number.isFinite(Number(batch && batch.metadata && batch.metadata.phase)) ? Number(batch.metadata.phase) : null,
          progress: Number.isFinite(Number(batch && batch.metadata && batch.metadata.progress)) ? Number(batch.metadata.progress) : null
        });
      }
    }
  }
  return turns.filter(function (turn) { return turn.userMessage || turn.botReply; });
}

function echoTurnsFromChange(change) {
  if (!change || change.field !== "smb_message_echoes") return [];
  const value = change.value || {};
  return (Array.isArray(value.message_echoes) ? value.message_echoes : []).map(function (message) {
    return {
      userId: digits(message && message.to),
      userMessage: "",
      botReply: messageText(message),
      sourceEventId: String(message && message.id || "").trim() || null,
      ts: isoFromWhatsAppTimestamp(message && message.timestamp),
      direction: "outbound"
    };
  }).filter(function (turn) { return turn.userId && turn.botReply; });
}

function contactsFromChange(change) {
  if (!change || change.field !== "smb_app_state_sync") return [];
  const value = change.value || {};
  return (Array.isArray(value.state_sync) ? value.state_sync : []).map(function (item) {
    const contact = item && item.contact || {};
    return {
      userId: digits(contact.phone_number),
      fullName: String(contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "").trim().slice(0, 120),
      action: String(item && item.action || "").trim().toLowerCase(),
      ts: isoFromWhatsAppTimestamp(item && item.metadata && item.metadata.timestamp)
    };
  }).filter(function (contact) { return contact.userId && contact.fullName && contact.action !== "remove" && contact.action !== "delete"; });
}

module.exports = {
  contactsFromChange,
  echoTurnsFromChange,
  historyTurnsFromChange,
  isoFromWhatsAppTimestamp,
  messageText
};
