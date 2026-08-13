"use strict";

const assert = require("assert");
const activity = require("./customer-panel-activity");

const result = activity.buildDailyClientActivity([
  { ts: "2026-08-13T14:00:00.000Z", channel: "whatsapp", userId: "573001", userMessage: "Hola" },
  { ts: "2026-08-13T14:01:00.000Z", channel: "whatsapp", userId: "573001", userMessage: "Otra pregunta" },
  { ts: "2026-08-13T15:00:00.000Z", channel: "whatsapp", userId: "573002", userMessage: "Hola" },
  { ts: "2026-08-13T16:00:00.000Z", channel: "instagram", userId: "ig:11", userMessage: "Hola IG" },
  { ts: "2026-08-13T17:00:00.000Z", channel: "messenger", userId: "ms:22", userMessage: "" },
  { ts: "2026-08-05T17:00:00.000Z", channel: "whatsapp", userId: "old", userMessage: "Fuera del rango" }
], { now: new Date("2026-08-13T18:00:00.000Z"), days: 7, timeZone: "America/Bogota" });

assert.strictEqual(result.metric, "unique_clients_per_day");
assert.strictEqual(result.by_channel.whatsapp.length, 7);
assert.strictEqual(result.by_channel.whatsapp[result.by_channel.whatsapp.length - 1].clients, 2, "el mismo cliente cuenta una sola vez por día");
assert.strictEqual(result.by_channel.instagram[result.by_channel.instagram.length - 1].clients, 1);
assert.strictEqual(result.by_channel.messenger[result.by_channel.messenger.length - 1].clients, 0, "filas sin mensaje entrante no cuentan como clientes atendidos");
assert.strictEqual(result.by_channel.whatsapp.reduce(function (sum, row) { return sum + row.clients; }, 0), 2);

console.log("customer panel activity tests passed");
