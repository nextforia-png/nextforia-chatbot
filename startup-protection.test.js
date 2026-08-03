"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  DISABLED_STARTUP_MUTATIONS,
  runStartupProtectionDiagnostics
} = require("./startup-protection");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

(async function run() {
  const productionState = {
    companies: [{ id: "tenant-a", company_name: "Empresa A", status: "activo" }],
    users: [{ user_id: "user-a", tenant_id: "tenant-a", status: "activo" }],
    setups: [{ tenant_id: "tenant-a", setup_completed: true, answers: { goal: "support" } }],
    connections: [{
      tenant_id: "meta-app-review-temporary",
      channel: "instagram",
      status: "connected",
      account_id: "ig-asset-1",
      instagram_user_id: "ig-asset-1",
      credentials_ciphertext: "encrypted-credential"
    }],
    conversations: [{ id: 1, tenant_id: "tenant-a", user_id: "customer-a", text: "hola" }]
  };
  const beforeRestart = clone(productionState);
  const mutationCalls = [];
  const store = {
    listAll: async function () { return clone(productionState.connections); },
    get: async function () { return clone(productionState.connections[0]); },
    upsert: async function () { mutationCalls.push("upsert"); throw new Error("mutation_not_allowed"); },
    append: async function () { mutationCalls.push("append"); throw new Error("mutation_not_allowed"); }
  };
  const logs = [];
  const environment = {
    NODE_ENV: "production",
    CHANNEL_CONNECTION_BOOTSTRAP_WHATSAPP_TENANT_ID: "tenant-a",
    CHANNEL_CONNECTION_INTERNAL_TENANT_ALIASES: JSON.stringify({ "tenant-old": "tenant-a" }),
    WA_TOKEN: "whatsapp-secret-must-not-be-logged",
    PHONE_NUMBER_ID: "phone-1",
    IG_ACCESS_TOKEN: "instagram-secret-must-not-be-logged",
    IG_USER_ID: "ig-asset-1",
    LEGACY_WHATSAPP_REGISTER_NOW: "1",
    NEXTFOR_PRICING_SYNC_ON_BOOT: "1"
  };

  const firstRestart = await runStartupProtectionDiagnostics({
    store,
    env: environment,
    log: function (level, event, fields) { logs.push({ level, event, fields }); }
  });
  const secondRestart = await runStartupProtectionDiagnostics({
    store,
    env: environment,
    log: function (level, event, fields) { logs.push({ level, event, fields }); }
  });

  assert.deepStrictEqual(productionState, beforeRestart, "restart diagnostics must not modify production records");
  assert.deepStrictEqual(mutationCalls, [], "restart diagnostics must never call a store mutation");
  assert.strictEqual(firstRestart.mode, "read_only");
  assert.strictEqual(secondRestart.mode, "read_only");
  assert.deepStrictEqual(firstRestart.disabled_mutations, DISABLED_STARTUP_MUTATIONS);
  assert(firstRestart.conflicts.some(function (item) {
    return item.code === "environment_channel_ownership_hints_ignored" &&
      item.decision === "pending_super_admin";
  }));
  assert(firstRestart.conflicts.some(function (item) {
    return item.code === "temporary_review_owner_active" &&
      item.decision === "pending_super_admin";
  }));
  assert(!JSON.stringify(logs).includes(environment.WA_TOKEN));
  assert(!JSON.stringify(logs).includes(environment.IG_ACCESS_TOKEN));

  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert(source.includes("runStartupProtectionDiagnostics"));
  assert(source.includes("const CHANNEL_CONNECTION_TENANT_ALIASES = Object.freeze({});"));
  assert(source.includes("const protectedLegacyChannelConnections = Object.freeze([]);"));
  assert(!source.includes("bootstrapExistingWhatsAppConnection"));
  assert(!source.includes("registerRavWhatsAppCloudNumberIfNeeded"));
  assert(!source.includes("retireTemporaryInstagramReviewOwners"));
  assert(!source.includes("retireMisassignedRavInstagramOwners"));
  assert(!source.includes("syncNextforPricingJuly2026"));
  assert(!source.includes("runRavInstagramHandoffRepairOnce"));
  assert(!source.includes("runRavInstagramDeliveryVerificationOnce"));

  const listenSource = source.slice(source.indexOf("app.listen(PORT"));
  assert(!/resetCustomerPanelAccess|\.upsert\(|\.adoptExisting\(|\.repairSubscription\(|\/register/.test(listenSource));

  console.log("startup-protection.test.js: ok");
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
