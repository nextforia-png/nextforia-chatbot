"use strict";

const assert = require("assert");
const {
  assertClientOnboardingRecordScope,
  clientOnboardingRecordId,
  inspectClientOnboardingScope
} = require("./client-onboarding-scope");

function scopedTurn(tenantId) {
  return { tenantId, userId: clientOnboardingRecordId(tenantId) };
}

const tenant = "empresa-nueva-7f43";
const valid = inspectClientOnboardingScope(scopedTurn(tenant), { tenant_id: tenant, answers: {} }, tenant);
assert.strictEqual(valid.ok, true);
assert.deepStrictEqual(valid.reasons, []);

const legacyOuter = inspectClientOnboardingScope(
  Object.assign(scopedTurn(tenant), { tenantId: "legacy-unassigned" }),
  { tenant_id: tenant, answers: {} },
  tenant
);
assert.strictEqual(legacyOuter.ok, false);
assert(legacyOuter.reasons.includes("outer_tenant_mismatch"));

const crossedRecord = inspectClientOnboardingScope(scopedTurn(tenant), { tenant_id: "otra-empresa", answers: {} }, tenant);
assert.strictEqual(crossedRecord.ok, false);
assert(crossedRecord.reasons.includes("record_tenant_mismatch"));

const crossedUser = inspectClientOnboardingScope(
  { tenantId: tenant, userId: clientOnboardingRecordId("otra-empresa") },
  { tenant_id: tenant, answers: {} },
  tenant
);
assert.strictEqual(crossedUser.ok, false);
assert(crossedUser.reasons.includes("record_user_id_mismatch"));

assert.strictEqual(assertClientOnboardingRecordScope({ tenant_id: tenant }, tenant), tenant);
assert.throws(
  function () { assertClientOnboardingRecordScope({ tenant_id: "otra-empresa" }, tenant); },
  function (error) { return error && error.code === "client_onboarding_tenant_conflict"; }
);

console.log("client onboarding scope tests passed");
