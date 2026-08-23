"use strict";

const assert = require("assert");
const fs = require("fs");

const source = fs.readFileSync(require.resolve("./index"), "utf8");

assert(source.includes("async function hydrateAppointmentsForConversation(tenantId, conversationIdentity)"));
assert(source.includes('customer_conversation_id: "eq." + customerConversationId'));
assert(source.includes("appointmentRegistry.list(tenantId)"));
assert(source.includes('{ now: Date.now(), tenantId }'));
assert(source.includes('conversationTurnContext.push("tools", "appointment_persistent_recall")'));
assert(source.includes("buildAppointmentRecallReply("));

const recallPosition = source.indexOf("const appointmentRecallIntent = classifyAppointmentRecallIntent(userMessage)");
const greetingPosition = source.indexOf("const configuredGreeting = configuredGreetingForTurn", recallPosition);
assert(recallPosition > 0 && greetingPosition > recallPosition, "persistent recall must run before a new-session greeting can hide the answer");
assert(!source.includes("const appointmentRecallIntent = usesAppointmentBot"), "durable recall must not depend on a potentially stale bot-mode flag");

console.log("appointment-recall-integration.test.js ok");
