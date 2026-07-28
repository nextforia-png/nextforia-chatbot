"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const crypto = require("crypto");
const net = require("net");
const path = require("path");
const { createPairingToken } = require("./commerce/pairing-token");

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
    const timer = setTimeout(function () {
      reject(new Error("server_start_timeout\n" + output));
    }, 30000);
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

(async function run() {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const commerceSecret = crypto.randomBytes(40).toString("base64url");
  const pairingSecret = crypto.randomBytes(40).toString("base64url");
  const authorization = { authorization: "Bearer " + commerceSecret };
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      DASHBOARD_KEY: "shopify-e2e-dashboard-key",
      DASHBOARD_SESSION_SECRET: "shopify-e2e-session-secret-value-long",
      VERIFY_TOKEN: "shopify-e2e-verify",
      WA_TOKEN: "shopify-e2e-wa",
      ANTHROPIC_API_KEY: "shopify-e2e-anthropic",
      CUSTOMER_ACCESS_V2_ENABLED: "1",
      CUSTOMER_ACCESS_TEST_MODE: "1",
      CUSTOMER_PANEL_BASE_URL: "https://staging.nextforia.com",
      CUSTOMER_ACCESS_TEST_USERS: JSON.stringify([{
        user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        tenant_id: "tenant-a",
        company_name: "Empresa A",
        email: "admin@a.example",
        password: "TenantPassword2026",
        role: "admin"
      }]),
      NEXFORIA_COMMERCE_SERVICE_SECRET: commerceSecret,
      NEXFORIA_PAIRING_SECRET: pairingSecret,
      SHOPIFY_APP_INSTALL_URL: "https://commerce.example.test/",
      SUPABASE_URL: "",
      SUPABASE_KEY: ""
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);
    let response = await fetch(base + "/internal/shopify/sessions/test");
    assert.strictEqual(response.status, 401);

    const entries = [
      ["id", "offline_rav-toys.myshopify.com"],
      ["shop", "rav-toys.myshopify.com"],
      ["state", "state-value"],
      ["isOnline", false],
      ["accessToken", "private-shopify-access-token"],
      ["scope", "read_products,read_orders"]
    ];
    response = await fetch(base + "/internal/shopify/sessions", {
      method: "POST",
      headers: Object.assign({ "content-type": "application/json" }, authorization),
      body: JSON.stringify({ session: entries })
    });
    assert.strictEqual(response.status, 200);

    response = await fetch(base + "/internal/shopify/sessions/offline_rav-toys.myshopify.com", {
      headers: authorization
    });
    assert.strictEqual(response.status, 200);
    let body = await response.json();
    assert.deepStrictEqual(body.session, entries);

    const token = createPairingToken({
      tenant_id: "tenant-a",
      bot_id: "atencion-cliente",
      shop: "rav-toys.myshopify.com"
    }, { secret: pairingSecret });
    response = await fetch(base + "/internal/shopify/pairings", {
      method: "POST",
      headers: Object.assign({ "content-type": "application/json" }, authorization),
      body: JSON.stringify({
        pairing_token: token,
        shop: "rav-toys.myshopify.com"
      })
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.strictEqual(body.tenant_id, "tenant-a");
    assert.strictEqual(body.bot_id, "atencion-cliente");
    assert(!JSON.stringify(body).includes("private-shopify-access-token"));

    response = await fetch(base + "/internal/shopify/pairings", {
      method: "POST",
      headers: Object.assign({ "content-type": "application/json" }, authorization),
      body: JSON.stringify({
        pairing_token: token.slice(0, -1) + "x",
        shop: "other.myshopify.com"
      })
    });
    assert.strictEqual(response.status, 422);

    response = await fetch(base + "/internal/shopify/sessions/offline_rav-toys.myshopify.com", {
      method: "DELETE",
      headers: authorization
    });
    assert.strictEqual(response.status, 200);
    response = await fetch(base + "/internal/shopify/sessions/offline_rav-toys.myshopify.com", {
      headers: authorization
    });
    assert.strictEqual(response.status, 404);

    console.log("shopify-production-connector.e2e.test.js: ok");
  } finally {
    child.kill("SIGTERM");
  }
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
