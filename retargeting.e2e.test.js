"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const net = require("net");
const path = require("path");

function availablePort() {
  return new Promise(function (resolve, reject) {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", function () {
      const port = server.address().port;
      server.close(function () { resolve(port); });
    });
  });
}

function waitForServer(child, port) {
  return new Promise(function (resolve, reject) {
    let output = "";
    const timeout = setTimeout(function () { reject(new Error("server_start_timeout\n" + output)); }, 30000);
    function inspect(chunk) {
      output += String(chunk || "");
      if (output.includes("running on port " + port)) {
        clearTimeout(timeout);
        resolve();
      }
    }
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", function (code) {
      clearTimeout(timeout);
      reject(new Error("server_exited_" + code + "\n" + output));
    });
  });
}

(async function () {
  const port = await availablePort();
  const key = "retargeting-e2e-key";
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      RETARGETING_TEST_MODE: "1",
      DASHBOARD_KEY: key,
      DASHBOARD_SESSION_SECRET: "retargeting-e2e-session-secret",
      RETARGETING_APPROVED_TEMPLATES: "abandoned_cart_rav,post_sale_review_rav,back_in_stock_rav,product_recommendation_rav",
      WA_TOKEN: "e2e-not-used",
      ANTHROPIC_API_KEY: "e2e-not-used",
      SUPABASE_URL: "",
      SUPABASE_KEY: ""
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  const base = "http://127.0.0.1:" + port;
  async function api(method, route, body) {
    const response = await fetch(base + route, {
      method,
      headers: { accept: "application/json", "content-type": "application/json", "x-dashboard-key": key },
      body: body == null ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(method + " " + route + " failed: " + response.status + " " + JSON.stringify(payload));
    return payload;
  }

  try {
    await waitForServer(child, port);
    const tenant = "e2e-a";
    const customer = "573001110001";
    await api("POST", "/admin/retargeting/consent", {
      tenant_id: tenant,
      customer_id: customer,
      category: "marketing",
      proof_id: "e2e-proof-a",
      granted_at: "2020-01-01T14:00:00.000Z",
      expires_at: "2035-01-01T14:00:00.000Z"
    });
    const simulation = await api("POST", "/admin/retargeting/jobs", {
      tenant_id: tenant,
      customer_id: customer,
      channel: "whatsapp",
      event_type: "high_intent",
      source_event_id: "e2e-simulation-1",
      source_at: "2020-01-01T14:00:00.000Z",
      last_customer_message_at: "2020-01-01T14:00:00.000Z",
      policy_override: { mode: "simulation", high_intent_delay_hours: 1 }
    });
    assert.strictEqual(simulation.result.job.status, "simulation_pending");
    const simulationRun = await api("POST", "/admin/retargeting/worker", { tenant_ids: [tenant] });
    assert.strictEqual(simulationRun.real_sends_enabled, false);
    assert.strictEqual(simulationRun.automatic_mode_enabled, false);
    assert.strictEqual(simulationRun.results[0].simulated, 1);
    assert.strictEqual(simulationRun.results[0].real_messages_sent, 0);
    const cronRun = childProcess.spawnSync(process.execPath, [path.join(__dirname, "retargeting-worker.js")], {
      cwd: __dirname,
      env: Object.assign({}, process.env, { BOT_BASE_URL: base, DASHBOARD_KEY: key, RETARGETING_TENANT_IDS: tenant }),
      encoding: "utf8"
    });
    assert.strictEqual(cronRun.status, 0, cronRun.stderr);
    assert.strictEqual(JSON.parse(cronRun.stdout).real_sends_enabled, false);

    const manual = await api("POST", "/admin/retargeting/jobs", {
      tenant_id: tenant,
      customer_id: customer,
      channel: "whatsapp",
      event_type: "abandoned_cart",
      source_event_id: "e2e-manual-1",
      source_at: "2020-01-01T14:00:00.000Z",
      last_customer_message_at: "2020-01-01T14:00:00.000Z",
      template: { name: "abandoned_cart_rav", status: "approved", active: true, quality: "active" },
      policy_override: { mode: "manual", abandoned_cart_delay_hours: 24 }
    });
    assert.strictEqual(manual.result.job.status, "pending_approval");
    await api("POST", "/admin/retargeting/jobs/" + encodeURIComponent(manual.result.job.id) + "/approve", { tenant_id: tenant });
    const manualRun = await api("POST", "/admin/retargeting/worker", { tenant_ids: [tenant] });
    assert.strictEqual(manualRun.results[0].blocked, 1);
    assert.strictEqual(manualRun.results[0].real_messages_sent, 0);

    const replyCandidate = await api("POST", "/admin/retargeting/jobs", {
      tenant_id: tenant,
      customer_id: "573001110002",
      channel: "whatsapp",
      event_type: "high_intent",
      source_event_id: "e2e-reply-1",
      source_at: "2026-07-17T14:00:00.000Z",
      consent: { category: "marketing", granted: true, proof_id: "inline-e2e", granted_at: "2026-01-01T00:00:00.000Z" },
      policy_override: { mode: "manual" }
    });
    await api("POST", "/admin/retargeting/signals", { tenant_id: tenant, customer_id: "573001110002", signal: "customer_replied", source_event_id: "e2e-inbound-2" });
    const afterReply = await api("GET", "/admin/retargeting?tenant_id=" + tenant);
    assert.strictEqual(afterReply.snapshot.jobs.find(function (job) { return job.id === replyCandidate.result.job.id; }).status, "cancelled");

    const automatic = await api("POST", "/admin/retargeting/jobs", {
      tenant_id: tenant,
      customer_id: "573001110003",
      channel: "whatsapp",
      event_type: "high_intent",
      source_event_id: "e2e-auto-1",
      consent: { category: "marketing", granted: true, proof_id: "inline-auto", granted_at: "2026-01-01T00:00:00.000Z" },
      policy_override: { mode: "automatic" }
    });
    assert(automatic.result.job.blockers.includes("automatic_mode_not_enabled"));

    const duplicatePayload = {
      tenant_id: tenant,
      customer_id: "573001110004",
      channel: "whatsapp",
      event_type: "high_intent",
      source_event_id: "e2e-concurrent-idempotency",
      consent: { category: "marketing", granted: true, proof_id: "inline-duplicate", granted_at: "2026-01-01T00:00:00.000Z" },
      policy_override: { mode: "simulation" }
    };
    await Promise.all([
      api("POST", "/admin/retargeting/jobs", duplicatePayload),
      api("POST", "/admin/retargeting/jobs", duplicatePayload)
    ]);
    const idempotentSnapshot = await api("GET", "/admin/retargeting?tenant_id=" + tenant);
    assert.strictEqual(idempotentSnapshot.snapshot.jobs.filter(function (job) { return job.source_event_id === "e2e-concurrent-idempotency"; }).length, 1);

    await api("POST", "/admin/retargeting/pause", { tenant_id: tenant, reason: "e2e" });
    assert.strictEqual((await api("GET", "/admin/retargeting?tenant_id=" + tenant)).snapshot.paused, true);
    await api("POST", "/admin/retargeting/resume", { tenant_id: tenant });

    const tenantB = await api("GET", "/admin/retargeting?tenant_id=e2e-b");
    assert.strictEqual(tenantB.snapshot.jobs.length, 0);
    assert.strictEqual(tenantB.snapshot.tenant_id, "e2e-b");

    console.log("retargeting e2e tests: ok");
  } finally {
    child.kill("SIGTERM");
  }
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
