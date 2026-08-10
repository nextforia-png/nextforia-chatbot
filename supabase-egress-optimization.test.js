"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const renderCustomerPanel = require("./customer-panel");

function source(name) {
  return fs.readFileSync(path.join(__dirname, name), "utf8");
}

const indexSource = source("index.js");
const upMigration = source("docs/migrations/20260808_supabase_egress_v1_up.sql");
const downMigration = source("docs/migrations/20260808_supabase_egress_v1_down.sql");

assert(indexSource.includes("supabaseFetchCustomerPanelPage(eventLimit + 1, { tenantId, before })"));
assert(indexSource.includes("CUSTOMER_PANEL_TURN_COLUMNS"));
assert(indexSource.includes("platform_customer_panel_recent_turns_v1"));
assert(indexSource.includes("platform_latest_conversation_tool_states_v1"));
assert(indexSource.includes("supabaseFetchLatestToolStates(CHANNEL_CONNECTION_STATE_TOOL)"));
assert(indexSource.includes("supabaseFetchLatestToolStates(APPOINTMENT_CALENDAR_CONNECTION_STATE_TOOL)"));
assert(indexSource.includes("supabaseFetchLatestToolStates(CLIENT_ONBOARDING_TOOL)"));
assert(!/app\.get\("\/admin\/panel\/data"[\s\S]{0,1800}supabaseFetchRecent\(500/.test(indexSource));

assert(upMigration.includes("distinct on (c.tenant_id, c.user_id)"));
assert(upMigration.includes("row_number() over"));
assert(upMigration.includes("perform public.platform_require_service_role_v2()"));
assert(upMigration.includes("grant execute on function public.platform_customer_panel_recent_turns_v1"));
assert(!/\b(delete|truncate|update)\s+public\.conversation_logs\b/i.test(upMigration));
assert(downMigration.includes("drop function if exists public.platform_customer_panel_recent_turns_v1"));

let html = "";
renderCustomerPanel({
  status: function () { return this; },
  setHeader: function () { return this; },
  send: function (value) { html = String(value); return this; }
}, {
  auth: { username: "qa@example.com", name: "QA", role: "admin" },
  tenantContext: { id: "tenant-qa", company_name: "QA", plan_id: "nextfor-aura", assigned_bot_id: "atencion-cliente" },
  capabilities: {},
  botVersion: "v-egress-test"
});

assert(html.includes('PANEL_DATA_PATH="/admin/panel/data?limit=100"'));
assert(html.includes("function loadOlderConversations()"));
assert(html.includes("Cargar conversaciones anteriores"));
assert(html.includes('document.addEventListener("visibilitychange"'));
assert(html.includes("setInterval(function(){if(!DEMO_MODE&&panelNeedsLiveRefresh())loadPanelData(false);},120000)"));
assert(!html.includes("loadPanelData(false);},30000"));

console.log("supabase-egress-optimization.test.js: ok");
