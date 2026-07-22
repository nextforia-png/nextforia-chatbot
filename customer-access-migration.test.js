"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const up = fs.readFileSync(path.join(__dirname, "docs/migrations/20260721_customer_access_v2_up.sql"), "utf8");
const down = fs.readFileSync(path.join(__dirname, "docs/migrations/20260721_customer_access_v2_down.sql"), "utf8");
const tables = ["platform_plans", "platform_bots", "tenants", "tenant_users", "tenant_invitations", "tenant_access_audit"];
const functions = [
  "platform_customer_access_catalogs_v2",
  "platform_create_customer_invitation_v2",
  "platform_update_invitation_delivery_v2",
  "platform_get_customer_invitation_v2",
  "platform_consume_customer_invitation_v2",
  "platform_active_tenant_user_by_email_v2",
  "platform_list_customer_invitations_v2",
  "platform_revoke_customer_invitation_v2"
];

assert.match(up, /^\s*--[\s\S]*\bbegin;/i);
assert.match(up, /\bcommit;\s*$/i);
tables.forEach(function (table) {
  assert.match(up, new RegExp("create table if not exists public\\." + table + "\\b", "i"));
  assert.match(up, new RegExp("alter table public\\." + table + " enable row level security", "i"));
  assert.match(up, new RegExp("alter table public\\." + table + " force row level security", "i"));
  assert.match(down, new RegExp("drop table if exists public\\." + table + "\\b", "i"));
});
functions.forEach(function (name) {
  assert.match(up, new RegExp("function public\\." + name + "\\b", "i"));
  assert.match(down, new RegExp("drop function if exists public\\." + name + "\\b", "i"));
});
assert.match(up, /auth\.role\(\)::text[\s\S]*service_role/i);
assert.match(up, /revoke all[\s\S]*from public, anon, authenticated/i);
assert.match(up, /tenant_invitations_token_hash check \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
assert.match(up, /unique \(email_normalized\)/i);
assert.match(up, /where i\.tenant_id = p_tenant_id and i\.token_hash = p_token_hash[\s\S]*for update;/i);
assert.match(up, /set used_at = now\(\)/i);
assert.doesNotMatch(up, /jsonb_build_object\([^)]*(token|password|hash)/i);
assert.match(down, /^\s*--[\s\S]*\bbegin;/i);
assert.match(down, /\bcommit;\s*$/i);

console.log("customer-access-migration.test.js: ok");
