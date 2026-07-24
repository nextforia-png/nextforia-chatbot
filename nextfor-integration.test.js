"use strict";

const assert = require("assert");
const { buildRavIntegration } = require("./nextfor-integration");

const approvedPilot = buildRavIntegration({
  DEFAULT_TENANT_ID: "rav-toys",
  TENANT_BRAND_NAME: "RAV Toys",
  WA_TOKEN: "configured",
  PHONE_NUMBER_ID: "999846293222612",
  META_APP_REVIEW_STATUS: "approved",
  TENANT_DISPLAY_PHONE: "+57 301 587 2708"
}, { metaWhatsappCheck: "ok" });

assert.strictEqual(approvedPilot.integration_number, 1);
assert.strictEqual(approvedPilot.status, "activation_pending");
assert.strictEqual(approvedPilot.app_review.approved, true);
assert.strictEqual(approvedPilot.connection.mode, "test");
assert.strictEqual(approvedPilot.connection.graph_api_ready, true);
assert.strictEqual(approvedPilot.connection.real_number_active, false);
assert.match(approvedPilot.next_action, /coexistencia/);
assert.strictEqual(Object.prototype.hasOwnProperty.call(approvedPilot, "wa_token"), false);

const live = buildRavIntegration({
  WA_TOKEN: "configured",
  PHONE_NUMBER_ID: "real-phone-id",
  META_APP_REVIEW_STATUS: "approved",
  WA_LIVE_ENABLED: "1"
}, { metaWhatsappCheck: "ok" });

assert.strictEqual(live.status, "live");
assert.strictEqual(live.connection.mode, "live");
assert.strictEqual(live.connection.real_number_active, true);

const unapproved = buildRavIntegration({
  META_APP_REVIEW_STATUS: "pending"
});

assert.strictEqual(unapproved.status, "review_pending");
assert.strictEqual(unapproved.connection.mode, "unconfigured");

console.log("nextfor-integration tests: ok");
