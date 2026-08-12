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

async function login(base, email, password) {
  const response = await fetch(base + "/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, password })
  });
  assert.strictEqual(response.status, 200);
  return String(response.headers.get("set-cookie") || "").split(";")[0];
}

(async function run() {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const password = "OrdersPassword2026!";
  const fixtures = [
    { user_id: "11111111-1111-4111-8111-111111111111", tenant_id: "orders-a", company_name: "Comercio A", email: "admin@orders-a.test", password, role: "admin", plan_id: "nextfor-aura", assigned_bot_id: "atencion-cliente" },
    { user_id: "22222222-2222-4222-8222-222222222222", tenant_id: "orders-b", company_name: "Comercio B", email: "admin@orders-b.test", password, role: "admin", plan_id: "nextfor-aura", assigned_bot_id: "atencion-cliente" },
    { user_id: "33333333-3333-4333-8333-333333333333", tenant_id: "orders-tempo", company_name: "Agenda", email: "admin@orders-tempo.test", password, role: "admin", plan_id: "nextfor-tempo", assigned_bot_id: "agendamiento" }
  ];
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      RENDER_SERVICE_NAME: "nextforia-chatbot-staging",
      CUSTOMER_ORDERS_V1_ENABLED: "1",
      CUSTOMER_ACCESS_V2_ENABLED: "1",
      CUSTOMER_ACCESS_TEST_MODE: "1",
      CUSTOMER_ACCESS_TEST_USERS: JSON.stringify(fixtures),
      CUSTOMER_PANEL_BASE_URL: "https://customer-panel.staging.example",
      DASHBOARD_SESSION_SECRET: "orders-session-secret",
      DASHBOARD_KEY: "orders-master-key",
      VERIFY_TOKEN: "orders-verify-token",
      WA_TOKEN: "orders-wa-dummy",
      ANTHROPIC_API_KEY: "orders-anthropic-dummy",
      SUPABASE_URL: "",
      SUPABASE_KEY: ""
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);
    const cookieA = await login(base, fixtures[0].email, password);
    const cookieB = await login(base, fixtures[1].email, password);
    const cookieTempo = await login(base, fixtures[2].email, password);

    let response = await fetch(base + "/admin/panel?tab=orders", { headers: { cookie: cookieA } });
    assert.strictEqual(response.status, 200);
    const htmlA = await response.text();
    assert(htmlA.includes('id="nav-orders"'));
    assert(htmlA.includes('id="panel-orders"'));
    assert(!htmlA.includes("#1042 · Valentina Ríos"), "the authenticated module must not render demo order rows as real data");

    response = await fetch(base + "/admin/panel/orders-data", { headers: { cookie: cookieA } });
    assert.strictEqual(response.status, 200);
    let data = await response.json();
    assert.strictEqual(data.business.id, "orders-a");
    assert.deepStrictEqual(data.orders, []);
    assert.strictEqual(data.can_manage, true);

    response = await fetch(base + "/admin/panel/orders-data", { headers: { cookie: cookieB } });
    assert.strictEqual(response.status, 200);
    data = await response.json();
    assert.strictEqual(data.business.id, "orders-b");
    assert.deepStrictEqual(data.orders, []);

    response = await fetch(base + "/admin/panel/orders-data", { headers: { cookie: cookieTempo } });
    assert.strictEqual(response.status, 403, "Tempo must not expose commerce orders");
    assert.strictEqual((await response.json()).error, "module_not_contracted");
    response = await fetch(base + "/admin/panel?tab=orders", { headers: { cookie: cookieTempo } });
    assert.strictEqual(response.status, 200);
    const tempoHtml = await response.text();
    assert(!tempoHtml.includes('id="nav-orders"'));
    assert(tempoHtml.includes('<section class="view active" id="panel-appointments">'));

    response = await fetch(base + "/admin/panel/orders/action", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: cookieA },
      body: JSON.stringify({ order_id: "ord-from-b", action: "confirm_payment" })
    });
    assert.strictEqual(response.status, 404, "a tenant must not infer or mutate another tenant order id");
    assert.strictEqual((await response.json()).error, "order_not_found");

    response = await fetch(base + "/admin/panel/orders/action", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ order_id: "ord-any", action: "confirm_payment" })
    });
    assert.strictEqual(response.status, 403, "state changes must keep same-origin protection");

    console.log("customer orders e2e tests passed");
  } finally {
    child.kill("SIGTERM");
  }
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
