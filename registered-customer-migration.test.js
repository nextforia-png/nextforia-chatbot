"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const up = fs.readFileSync(path.join(__dirname, "docs/migrations/20260729_registered_customer_tenant_up.sql"), "utf8");
const down = fs.readFileSync(path.join(__dirname, "docs/migrations/20260729_registered_customer_tenant_down.sql"), "utf8");

assert.match(up, /^\s*--[\s\S]*\bbegin;/i);
assert.match(up, /\bcommit;\s*$/i);
assert.match(up, /function public\.platform_create_registered_customer_invitation_v1\b/i);
assert.match(up, /perform public\.platform_require_service_role_v2\(\)/i);
assert(up.includes("v_tenant_id !~ '^[a-z0-9][a-z0-9_-]{1,79}$'"));
assert.match(up, /values \(v_tenant_id, btrim\(p_company_name\), p_plan_id, p_assigned_bot_id, 'setup'\)/i);
assert.match(up, /revoke all[\s\S]*from public, anon, authenticated/i);
assert.match(up, /grant execute[\s\S]*to service_role/i);
assert.match(down, /drop function if exists public\.platform_create_registered_customer_invitation_v1/i);

console.log("registered-customer-migration.test.js: ok");
