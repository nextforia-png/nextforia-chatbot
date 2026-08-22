"use strict";

function cleanText(value, maxLength) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, maxLength || 5000);
}

function validTimestamp(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function hiddenReply(value) {
  const text = cleanText(value, 5000);
  if (!text) return true;
  return /^\[(?:error interno|fallback:|encrypted data unavailable)\]/i.test(text) || text === "(sin texto)";
}

function appendMessage(messages, role, content) {
  const text = cleanText(content, 5000);
  if (!text) return;
  const previous = messages[messages.length - 1];
  if (previous && previous.role === role) {
    if (previous.content !== text) previous.content = cleanText(previous.content + "\n" + text, 9000);
    return;
  }
  messages.push({ role, content: text });
}

function conversationHistoryFromTurns(turns, options) {
  options = options || {};
  const now = Number(options.now) || Date.now();
  const ttlMs = Math.max(1, Number(options.ttlMs) || 6 * 60 * 60 * 1000);
  const maxMessages = Math.max(2, Number(options.maxMessages) || 18);
  const clearTool = cleanText(options.clearTool, 120);
  const excludeSourceEventId = cleanText(options.excludeSourceEventId, 500);
  const isInternalTurn = typeof options.isInternalTurn === "function"
    ? options.isInternalTurn
    : function () { return false; };
  const ordered = (Array.isArray(turns) ? turns : []).slice().sort(function (a, b) {
    return validTimestamp(a && (a.ts || a.created_at)) - validTimestamp(b && (b.ts || b.created_at));
  });
  let clearedAt = 0;
  ordered.forEach(function (turn) {
    const tools = Array.isArray(turn && turn.tools) ? turn.tools : [];
    if (clearTool && tools.includes(clearTool)) clearedAt = Math.max(clearedAt, validTimestamp(turn && (turn.ts || turn.created_at)));
  });

  const messages = [];
  let lastActivityAt = 0;
  ordered.forEach(function (turn) {
    const timestamp = validTimestamp(turn && (turn.ts || turn.created_at));
    if (!timestamp || now - timestamp > ttlMs || timestamp <= clearedAt) return;
    if (excludeSourceEventId && cleanText(turn && (turn.sourceEventId || turn.source_event_id), 500) === excludeSourceEventId) return;
    if (isInternalTurn(turn)) return;
    if (cleanText(turn && turn.status, 60).toLowerCase() !== "ok") return;
    const userMessage = cleanText(turn && (turn.userMessage || turn.user_message), 5000);
    const botReply = cleanText(turn && (turn.botReply || turn.bot_reply), 5000);
    if (!userMessage || hiddenReply(botReply)) return;
    appendMessage(messages, "user", userMessage);
    appendMessage(messages, "assistant", botReply);
    lastActivityAt = Math.max(lastActivityAt, timestamp);
  });

  const trimmed = messages.slice(-maxMessages);
  while (trimmed.length && trimmed[0].role !== "user") trimmed.shift();
  while (trimmed.length && trimmed[trimmed.length - 1].role !== "assistant") trimmed.pop();
  return { messages: trimmed, lastActivityAt };
}

module.exports = {
  conversationHistoryFromTurns,
  hiddenReply
};
