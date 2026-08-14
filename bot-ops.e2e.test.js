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
    const timer = setTimeout(function () { reject(new Error("server_start_timeout\n" + output)); }, 30000);
    function inspect(chunk) {
      output += String(chunk || "");
      if (output.includes("running on port " + port)) {
        clearTimeout(timer);
        resolve();
      }
    }
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", function (code) {
      clearTimeout(timer);
      reject(new Error("server_exited_" + code + "\n" + output));
    });
  });
}

async function requestJson(base, pathname, key, options) {
  options = options || {};
  const response = await fetch(base + pathname, Object.assign({}, options, {
    headers: Object.assign({
      accept: "application/json",
      "content-type": "application/json",
      "x-dashboard-key": key
    }, options.headers || {})
  }));
  const body = await response.json();
  return { response, body };
}

(async function run() {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const dashboardKey = "bot-ops-e2e-dashboard-key";
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      BOT_OPS_TEST_MODE: "1",
      BOT_OPS_ENABLED: "1",
      BOT_OPS_CONTROLLED_TESTS_ENABLED: "1",
      DASHBOARD_KEY: dashboardKey,
      DASHBOARD_SESSION_SECRET: "bot-ops-e2e-session-secret-value",
      VERIFY_TOKEN: "bot-ops-e2e-verify-token",
      WA_TOKEN: "bot-ops-e2e-wa-token",
      ANTHROPIC_API_KEY: "bot-ops-e2e-anthropic-key",
      SUPABASE_URL: "",
      SUPABASE_KEY: ""
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);

    let result = await requestJson(base, "/admin/bot-ops/controlled-test", dashboardKey, {
      method: "POST",
      body: JSON.stringify({ fixture: "failed_message" })
    });
    assert.strictEqual(result.response.status, 200);

    result = await requestJson(base, "/admin/bot-ops/controlled-test", dashboardKey, {
      method: "POST",
      body: JSON.stringify({ fixture: "dissatisfied_customer" })
    });
    assert.strictEqual(result.response.status, 200);

    result = await requestJson(base, "/admin/bot-ops/review", dashboardKey, {
      method: "POST",
      body: JSON.stringify({ review_type: "daily" })
    });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.body.summary.reviewed_events, 2);
    assert.strictEqual(result.body.overall_status, "critical");

    result = await requestJson(base, "/admin/bot-ops/review", dashboardKey, {
      method: "POST",
      body: JSON.stringify({ review_type: "weekly" })
    });
    assert.strictEqual(result.response.status, 200);
    assert(result.body.summary.patterns.length >= 2);

    result = await requestJson(base, "/admin/bot-ops/summary", dashboardKey);
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.body.overall_status, "critical");
    assert(result.body.last_daily_review);
    assert(result.body.last_weekly_review);
    assert(result.body.last_updated);
    assert(result.body.open_incidents.some(function (finding) {
      return finding.tenant_id === "bot-ops-staging-test" && finding.category === "message_not_sent";
    }));
    assert(result.body.open_incidents.some(function (finding) {
      return finding.tenant_id === "bot-ops-staging-dissatisfaction" && finding.category === "customer_dissatisfaction";
    }));
    assert(result.body.open_incidents.every(function (finding) {
      return !String(finding.detail || "").includes("controlled-customer") && !String(finding.detail || "").includes("dissatisfied-customer");
    }));
    assert.strictEqual(result.body.guardrails.automatic_prompt_changes, false);
    assert.strictEqual(result.body.guardrails.automatic_bot_configuration_changes, false);

    const panel = await fetch(base + "/admin/super-admin?view=botOps", {
      headers: { "x-dashboard-key": dashboardKey }
    });
    assert.strictEqual(panel.status, 200);
    const html = await panel.text();
    assert(html.includes('data-panel="botOps"'));
    assert(html.includes('id="botOpsOverall"'));
    assert(html.includes("/admin/bot-ops/summary"));

    console.log("bot-ops e2e tests passed");
  } finally {
    child.kill("SIGTERM");
    await new Promise(function (resolve) { child.once("exit", resolve); setTimeout(resolve, 2000); });
  }
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
