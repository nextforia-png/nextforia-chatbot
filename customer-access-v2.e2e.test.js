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

async function login(base, email, password) {
  const response = await fetch(base + "/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: email, password: password })
  });
  assert.strictEqual(response.status, 200);
  return String(response.headers.get("set-cookie") || "").split(";")[0];
}

(async function run() {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      DASHBOARD_KEY: "customer-access-v2-e2e-key",
      DASHBOARD_SESSION_SECRET: "customer-access-v2-e2e-session-secret",
      DASHBOARD_USERS: JSON.stringify([
        { username: "platform@nextforia.example", email: "platform@nextforia.example", password: "platform-test-password", role: "super_admin", name: "Platform" },
        { username: "admin@legacy.example", email: "admin@legacy.example", password: "admin-test-password", role: "admin", tenant_id: "rav-toys", name: "Admin legado" },
        { username: "agent@legacy.example", email: "agent@legacy.example", password: "agent-test-password", role: "agent", tenant_id: "rav-toys", name: "Agente legado" },
        { username: "viewer@legacy.example", email: "viewer@legacy.example", password: "viewer-test-password", role: "viewer", tenant_id: "rav-toys", name: "Viewer legado" }
      ]),
      VERIFY_TOKEN: "customer-access-v2-verify",
      WA_TOKEN: "customer-access-v2-wa-dummy",
      ANTHROPIC_API_KEY: "customer-access-v2-anthropic-dummy",
      SUPABASE_URL: "",
      SUPABASE_KEY: "",
      CUSTOMER_ACCESS_V2_ENABLED: "1",
      CUSTOMER_ACCESS_TEST_MODE: "1",
      CUSTOMER_PANEL_BASE_URL: "https://customer-panel.staging.example"
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);
    const adminCookie = await login(base, "admin@legacy.example", "admin-test-password");
    const agentCookie = await login(base, "agent@legacy.example", "agent-test-password");
    const viewerCookie = await login(base, "viewer@legacy.example", "viewer-test-password");
    const superCookie = await login(base, "platform@nextforia.example", "platform-test-password");
    let response = await fetch(base + "/admin/customer-access/catalogs");
    assert.strictEqual(response.status, 401, "anonymous users cannot read platform catalogs");
    response = await fetch(base + "/admin/customer-access/catalogs", { headers: { cookie: adminCookie } });
    assert.strictEqual(response.status, 401, "admin cannot use super admin customer creation");
    for (const restrictedCookie of [agentCookie, viewerCookie]) {
      response = await fetch(base + "/admin/customer-invitations", { headers: { cookie: restrictedCookie } });
      assert.strictEqual(response.status, 401, "agent/viewer cannot inspect platform invitations");
    }
    response = await fetch(base + "/admin/customer-access/catalogs", { headers: { cookie: superCookie } });
    assert.strictEqual(response.status, 200);
    const catalogs = await response.json();
    assert(catalogs.plans.some(function (row) { return row.id === "nextfor-aura"; }));
    assert(catalogs.plans.some(function (row) { return row.id === "nextfor-uno"; }));
    assert(!catalogs.plans.some(function (row) { return row.id === "nextfor-tempo" || row.id === "nextfor-atlas" || row.id === "nextfor-signature"; }));
    assert(catalogs.bots.some(function (row) { return row.id === "atencion-cliente"; }));

    response = await fetch(base + "/admin/super-admin", { headers: { cookie: superCookie } });
    assert.strictEqual(response.status, 200);
    const panel = await response.text();
    assert(panel.includes("Crear cliente"));
    assert(panel.includes('name="company_name"'));

    response = await fetch(base + "/admin/customer-invite", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie, origin: base },
      body: JSON.stringify({ company_name: "Empresa bloqueada", admin_email: "blocked@example.com", plan_id: "nextfor-aura", assigned_bot_id: "atencion-cliente" })
    });
    assert.strictEqual(response.status, 401);

    response = await fetch(base + "/admin/customer-invite", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: superCookie, origin: base },
      body: JSON.stringify({ company_name: "Empresa incompleta", admin_email: "incomplete@example.com", plan_id: "nextfor-aura" })
    });
    assert.strictEqual(response.status, 400);
    assert.strictEqual((await response.json()).error, "invalid_request");

    const createPayload = { company_name: "Empresa Staging", admin_email: " Admin@Staging.Example ", plan_id: "nextfor-aura", assigned_bot_id: "atencion-cliente" };
    response = await fetch(base + "/admin/customer-invite", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: superCookie, origin: base },
      body: JSON.stringify(createPayload)
    });
    assert.strictEqual(response.status, 201);
    const created = await response.json();
    assert.strictEqual(created.membership.email, "admin@staging.example");
    assert.strictEqual(created.membership.status, "pending");
    assert.strictEqual(created.invitation.status, "sent");
    assert(!JSON.stringify(created).includes("setup_url"));
    assert(!JSON.stringify(created).includes("token_hash"));

    response = await fetch(base + "/admin/customer-invite", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: superCookie, origin: base },
      body: JSON.stringify({ company_name: "Otra empresa", admin_email: "admin@staging.example", plan_id: "nextfor-aura", assigned_bot_id: "atencion-cliente" })
    });
    assert.strictEqual(response.status, 409);
    assert.strictEqual((await response.json()).error, "customer_already_exists");

    response = await fetch(base + "/admin/customer-invitations", { headers: { cookie: superCookie } });
    assert.strictEqual(response.status, 200);
    const listed = await response.json();
    assert.strictEqual(listed.invitations.length, 1);
    assert.strictEqual(listed.invitations[0].status, "sent");
    assert(!JSON.stringify(listed).includes("token_hash"));
    assert(!JSON.stringify(listed).includes("setup_url"));
    assert(!JSON.stringify(listed).includes("password"));

    response = await fetch(base + "/admin/customer-invitations/" + created.invitation.id + "/revoke", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: superCookie, origin: base },
      body: "{}"
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual((await response.json()).invitation.status, "revoked");

    for (const route of ["/signup", "/register", "/admin/signup"]) {
      response = await fetch(base + route, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: "{}" });
      assert.strictEqual(response.status, 404, route + " must not expose public signup");
    }
    response = await fetch(base + "/admin/health", { headers: { cookie: superCookie } });
    assert.strictEqual(response.status, 200);

    console.log("customer-access-v2.e2e.test.js: ok");
  } finally {
    child.kill("SIGTERM");
  }
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
