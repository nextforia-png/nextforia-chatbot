"use strict";

const baseUrl = String(process.env.BOT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const dashboardKey = String(process.env.DASHBOARD_KEY || "");
const tenantIds = String(process.env.RETARGETING_TENANT_IDS || "")
  .split(",")
  .map(function (value) { return value.trim(); })
  .filter(Boolean);

if (!dashboardKey) {
  console.error("DASHBOARD_KEY is required for the retargeting worker.");
  process.exit(1);
}

(async function () {
  const response = await fetch(baseUrl + "/admin/retargeting/worker", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-dashboard-key": dashboardKey
    },
    body: JSON.stringify(tenantIds.length ? { tenant_ids: tenantIds } : {})
  });
  const body = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(body.message || body.error || "worker_http_" + response.status);
  const sent = (body.results || []).reduce(function (sum, row) { return sum + Number(row.real_messages_sent || 0); }, 0);
  if (body.real_sends_enabled !== false || body.automatic_mode_enabled !== false || sent !== 0) {
    throw new Error("retargeting_safety_invariant_failed");
  }
  console.log(JSON.stringify(body));
})().catch(function (error) {
  console.error("Retargeting worker failed:", error.message);
  process.exit(1);
});
