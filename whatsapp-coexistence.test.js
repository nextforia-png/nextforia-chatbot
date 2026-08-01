"use strict";

const assert = require("assert");
const {
  contactsFromChange,
  echoTurnsFromChange,
  historyTurnsFromChange,
  messageText
} = require("./whatsapp-coexistence");

const history = historyTurnsFromChange({
  field: "history",
  value: {
    metadata: { display_phone_number: "+57 301 587 2708", phone_number_id: "phone-rav" },
    history: [{
      metadata: { phase: 0, chunk_order: 1, progress: 55 },
      threads: [{
        id: "573001112233",
        messages: [{
          from: "573001112233",
          id: "wamid.inbound",
          timestamp: "1739230970",
          type: "text",
          text: { body: "Hola, busco un regalo" },
          history_context: { status: "READ" }
        }, {
          from: "573015872708",
          to: "573001112233",
          id: "wamid.outbound",
          timestamp: "1739231000",
          type: "text",
          text: { body: "Claro, ¿para qué edad?" },
          history_context: { status: "DELIVERED" }
        }]
      }]
    }]
  }
});

assert.strictEqual(history.length, 2);
assert.deepStrictEqual(history.map(function (turn) { return turn.direction; }), ["inbound", "outbound"]);
assert.strictEqual(history[0].userId, "573001112233");
assert.strictEqual(history[0].userMessage, "Hola, busco un regalo");
assert.strictEqual(history[0].botReply, "");
assert.strictEqual(history[0].ts, "2025-02-10T23:42:50.000Z");
assert.strictEqual(history[1].botReply, "Claro, ¿para qué edad?");
assert.strictEqual(history[1].status, "delivered");

const echoes = echoTurnsFromChange({
  field: "smb_message_echoes",
  value: {
    message_echoes: [{
      from: "573015872708",
      to: "573001112233",
      id: "wamid.echo",
      timestamp: "1739231050",
      type: "text",
      text: { body: "Te respondí desde el celular" }
    }]
  }
});
assert.strictEqual(echoes.length, 1);
assert.strictEqual(echoes[0].userId, "573001112233");
assert.strictEqual(echoes[0].botReply, "Te respondí desde el celular");

const contacts = contactsFromChange({
  field: "smb_app_state_sync",
  value: {
    state_sync: [{
      type: "contact",
      action: "add",
      contact: { full_name: "María Cliente", phone_number: "+57 300 111 2233" },
      metadata: { timestamp: "1739231100" }
    }]
  }
});
assert.deepStrictEqual(contacts.map(function (contact) {
  return { userId: contact.userId, fullName: contact.fullName };
}), [{ userId: "573001112233", fullName: "María Cliente" }]);

assert.strictEqual(messageText({ type: "image", image: {} }), "[Imagen]");
assert.strictEqual(messageText({ type: "media_placeholder" }), "[Archivo multimedia del historial]");
assert.deepStrictEqual(historyTurnsFromChange({ field: "messages", value: {} }), []);
assert.deepStrictEqual(historyTurnsFromChange({
  field: "history",
  value: { history: [{ errors: [{ code: 2593109 }] }] }
}), []);

console.log("WhatsApp coexistence tests passed");
