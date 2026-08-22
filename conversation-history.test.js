"use strict";

const assert = require("assert");
const { conversationHistoryFromTurns, hiddenReply } = require("./conversation-history");

const now = Date.parse("2026-08-22T12:50:00.000Z");
const turns = [
  {
    ts: "2026-08-22T12:34:00.000Z",
    status: "ok",
    sourceEventId: "wa-1",
    userMessage: "Domingo 23 de agosto a las 9:00am",
    botReply: "El domingo no atendemos. ¿Qué día entre lunes y viernes prefieres?",
    tools: ["atlas_route_appointments"]
  },
  {
    ts: "2026-08-22T12:47:00.000Z",
    status: "ok",
    sourceEventId: "wa-2",
    userMessage: "Entonces lunes 8:00am",
    botReply: "Voy a validar el lunes a las 8:00am.",
    tools: ["atlas_route_appointments"]
  },
  {
    ts: "2026-08-22T12:49:00.000Z",
    status: "inbound_received",
    sourceEventId: "wa-current",
    userMessage: "Es 24 de agosto",
    botReply: "",
    tools: []
  },
  {
    ts: "2026-08-22T12:49:20.000Z",
    status: "error",
    sourceEventId: "wa-error",
    userMessage: "Confirma",
    botReply: "[error interno]",
    tools: []
  }
];

let restored = conversationHistoryFromTurns(turns, {
  now,
  ttlMs: 6 * 60 * 60 * 1000,
  maxMessages: 12,
  excludeSourceEventId: "wa-current"
});
assert.deepStrictEqual(restored.messages.map(function (message) { return message.content; }), [
  "Domingo 23 de agosto a las 9:00am",
  "El domingo no atendemos. ¿Qué día entre lunes y viernes prefieres?",
  "Entonces lunes 8:00am",
  "Voy a validar el lunes a las 8:00am."
]);
assert.strictEqual(restored.lastActivityAt, Date.parse("2026-08-22T12:47:00.000Z"));

restored = conversationHistoryFromTurns(turns.concat([{
  ts: "2026-08-22T12:48:00.000Z",
  status: "ok",
  userMessage: "",
  botReply: "[CustomerConversationClear] {}",
  tools: ["customer_conversation_clear_v1"]
}]), {
  now,
  clearTool: "customer_conversation_clear_v1"
});
assert.deepStrictEqual(restored.messages, [], "clearing a conversation must prevent old history from being restored");
assert.strictEqual(hiddenReply("[error interno]"), true);
assert.strictEqual(hiddenReply("Respuesta válida"), false);

console.log("conversation-history.test.js ok");
