"use strict";

const assert = require("assert");
const {
  buildServiceAreaContext,
  buildServiceAreaQuestion,
  classifyServiceAreaReply,
  detectPhoneCountry,
  normalizeCountryCode,
  serviceAreaCheckForPhone
} = require("./service-area");

assert.strictEqual(normalizeCountryCode(" co "), "CO");
assert.strictEqual(normalizeCountryCode("invalid", "MX"), "MX");
assert.strictEqual(detectPhoneCountry("573015872708"), "CO");
assert.strictEqual(detectPhoneCountry("14155552671"), "US");
assert.strictEqual(detectPhoneCountry("not-a-phone"), null);

assert.strictEqual(serviceAreaCheckForPhone("573015872708", {
  countryCode: "CO",
  countryName: "Colombia",
  enabled: true
}).shouldAsk, false);
assert.strictEqual(serviceAreaCheckForPhone("14155552671", {
  countryCode: "CO",
  countryName: "Colombia",
  enabled: true
}).shouldAsk, true);
assert.strictEqual(serviceAreaCheckForPhone("14155552671", {
  countryCode: "CO",
  countryName: "Colombia",
  enabled: false
}).shouldAsk, false);

assert.strictEqual(classifyServiceAreaReply("Sí, estoy en Colombia", "Colombia"), "inside");
assert.strictEqual(classifyServiceAreaReply("No, estoy en Colombia", "Colombia"), "inside");
assert.strictEqual(classifyServiceAreaReply("No estoy en Colombia", "Colombia"), "outside");
assert.strictEqual(classifyServiceAreaReply("Necesito la entrega en Colombia", "Colombia"), "inside");
assert.strictEqual(classifyServiceAreaReply("No, estoy fuera", "Colombia"), "outside");
assert.strictEqual(classifyServiceAreaReply("Busco un regalo para una niña", "Colombia"), "unclear");

const question = buildServiceAreaQuestion({ countryName: "Colombia" });
assert(question.includes("Parece"));
assert(question.includes("Colombia"));
assert(!question.includes("estás fuera"));

const outsideContext = buildServiceAreaContext({ status: "outside" }, { countryName: "Colombia" });
assert(outsideContext.includes("No prometas envios internacionales"));
assert(outsideContext.includes("direccion de entrega dentro de Colombia"));
const unclearContext = buildServiceAreaContext({ status: "unclear" }, { countryName: "Colombia" });
assert(unclearContext.includes("No repitas la pregunta general"));

console.log("service area tests passed");
