"use strict";

const assert = require("assert");
const fs = require("fs");
const {
  applyTenantOutboundPolicy,
  RAV_EMPTY_CATALOG_RECOVERY,
  RAV_TECHNICAL_RECOVERY
} = require("./tenant-outbound-policy");

const appointmentReply = "Permíteme verificar nuevamente la fecha. Parece que hay un inconveniente con esa fecha específica.";
const nextfor = applyTenantOutboundPolicy({
  text: appointmentReply,
  bot_generated: true,
  business_tools_profile: ""
});
assert.deepStrictEqual(nextfor, { text: appointmentReply, transformed: false, reason: null });
assert(!/RAV|catálogo|juguete|peque/i.test(nextfor.text), "a non-RAV tenant must never receive RAV recovery copy");

const rav = applyTenantOutboundPolicy({
  text: appointmentReply,
  bot_generated: true,
  business_tools_profile: "rav"
});
assert.strictEqual(rav.text, RAV_TECHNICAL_RECOVERY);
assert.strictEqual(rav.reason, "rav_technical_recovery");

const manual = applyTenantOutboundPolicy({
  text: "Tenemos un inconveniente y te ayudaremos ahora.",
  bot_generated: false,
  business_tools_profile: "rav"
});
assert.strictEqual(manual.text, "Tenemos un inconveniente y te ayudaremos ahora.", "human messages must never be rewritten");

const emptyCatalog = applyTenantOutboundPolicy({
  text: "Mira https://ravtoys.com/search?q=sin-resultados",
  bot_generated: true,
  business_tools_profile: "rav",
  zero_search_active: true
});
assert.strictEqual(emptyCatalog.text, RAV_EMPTY_CATALOG_RECOVERY);

const foreignCatalog = applyTenantOutboundPolicy({
  text: "Mira https://ravtoys.com/search?q=sin-resultados",
  bot_generated: true,
  business_tools_profile: "",
  zero_search_active: true
});
assert.strictEqual(foreignCatalog.transformed, false);

const applicationSource = fs.readFileSync(require.resolve("./index"), "utf8");
assert(applicationSource.includes('business_tools_profile: isRavTenantId(policyTenantId) ? "rav" : ""'));
assert(!applicationSource.includes("EXCUSAS TÉCNICAS — INCONDICIONAL"));
assert(!applicationSource.includes("me compartes el enlace del producto"), "shared attachment fallbacks must remain tenant-neutral");

console.log("tenant-outbound-policy.test.js ok");
