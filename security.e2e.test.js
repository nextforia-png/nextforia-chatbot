"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const crypto = require("crypto");
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
    const timer = setTimeout(function () { reject(new Error("server_start_timeout\n" + output)); }, 15000);
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

(async function () {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const dashboardKey = "security-e2e-dashboard-key";
  const appSecret = "security-e2e-meta-app-secret";
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      DASHBOARD_KEY: dashboardKey,
      DASHBOARD_USERS: JSON.stringify([{ username: "platform-owner", email: "owner@example.test", password: "test-platform-password", name: "Platform Owner", role: "super_admin" }]),
      DASHBOARD_SESSION_SECRET: "security-e2e-session-secret-value",
      META_APP_SECRET: appSecret,
      VERIFY_TOKEN: "security-e2e-verify-token",
      WA_TOKEN: "e2e-not-used",
      ANTHROPIC_API_KEY: "e2e-not-used",
      SUPABASE_URL: "",
      SUPABASE_KEY: ""
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);

    let response = await fetch(base + "/");
    assert.strictEqual(response.headers.get("x-frame-options"), "DENY");
    assert((response.headers.get("content-security-policy") || "").includes("frame-ancestors 'none'"));

    response = await fetch(base + "/admin/stats?key=" + encodeURIComponent(dashboardKey));
    assert.strictEqual(response.status, 401, "URL keys must not authenticate");

    response = await fetch(base + "/admin/stats", { headers: { "x-dashboard-key": dashboardKey } });
    assert.strictEqual(response.status, 200, "header key should authenticate automation clients");

    response = await fetch(base + "/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: dashboardKey })
    });
    assert.strictEqual(response.status, 403, "browser mutations without an origin must fail");

    response = await fetch(base + "/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ key: dashboardKey })
    });
    assert.strictEqual(response.status, 200);
    const cookie = response.headers.get("set-cookie") || "";
    assert(cookie.includes("HttpOnly"));
    assert(cookie.includes("SameSite=Strict"));

    response = await fetch(base + "/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ username: "owner@example.test", password: "test-platform-password" })
    });
    assert.strictEqual(response.status, 200, "super admin email login should succeed");
    const emailLogin = await response.json();
    assert.strictEqual(emailLogin.user.role, "super_admin");

    const webhookBody = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    response = await fetch(base + "/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: webhookBody
    });
    assert.strictEqual(response.status, 401, "unsigned webhooks must fail closed");

    const signature = "sha256=" + crypto.createHmac("sha256", appSecret).update(webhookBody).digest("hex");
    response = await fetch(base + "/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      body: webhookBody
    });
    assert.strictEqual(response.status, 200, "valid Meta signature should be accepted");

    console.log("security e2e tests passed");
  } finally {
    child.kill("SIGTERM");
  }
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
