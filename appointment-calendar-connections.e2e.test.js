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

async function login(base, email, password, platform) {
  const response = await fetch(base + "/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify(platform ? { username: email, password } : { email, password })
  });
  assert.strictEqual(response.status, 200);
  return String(response.headers.get("set-cookie") || "").split(";")[0];
}

(async function run() {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const password = "TenantPassword2026";
  const fixtures = [
    {
      user_id: "11111111-1111-4111-8111-111111111111",
      tenant_id: "tenant-service",
      company_name: "Cliente Servicio",
      email: "admin@service.example",
      password,
      role: "admin",
      plan_id: "nextfor-aura",
      assigned_bot_id: "atencion-cliente",
      setup_completed: true
    },
    {
      user_id: "22222222-2222-4222-8222-222222222222",
      tenant_id: "tenant-appointments",
      company_name: "Cliente Citas",
      email: "admin@appointments.example",
      password,
      role: "admin",
      plan_id: "nextfor-tempo",
      assigned_bot_id: "appointments",
      setup_completed: true
    }
  ];
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      APPOINTMENT_SETUP_ENABLED: "1",
      DASHBOARD_KEY: "appointment-calendar-e2e-key",
      DASHBOARD_SESSION_SECRET: "appointment-calendar-e2e-session-secret",
      DASHBOARD_USERS: JSON.stringify([
        {
          username: "owner",
          email: "owner@nextforia.example",
          password: "OwnerPassword2026",
          name: "Platform Owner",
          role: "super_admin"
        }
      ]),
      VERIFY_TOKEN: "appointment-calendar-verify",
      WA_TOKEN: "appointment-calendar-wa-dummy",
      ANTHROPIC_API_KEY: "appointment-calendar-anthropic-dummy",
      DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64url"),
      CUSTOMER_ACCESS_V2_ENABLED: "1",
      CUSTOMER_ACCESS_TEST_MODE: "1",
      CUSTOMER_ACCESS_TEST_USERS: JSON.stringify(fixtures),
      CUSTOMER_PANEL_BASE_URL: "https://customer-panel.staging.example",
      GOOGLE_CALENDAR_CLIENT_ID: "google-calendar-client",
      GOOGLE_CALENDAR_CLIENT_SECRET: "google-calendar-secret",
      MICROSOFT_CALENDAR_CLIENT_ID: "microsoft-calendar-client",
      MICROSOFT_CALENDAR_CLIENT_SECRET: "microsoft-calendar-secret",
      CHANNEL_CONNECTIONS_V1_ENABLED: "1",
      CHANNEL_CONNECTIONS_TEST_MODE: "1",
      META_APP_ID: "meta-app",
      META_APP_SECRET: "meta-secret",
      META_WHATSAPP_CONFIG_ID: "whatsapp-config"
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);
    const serviceCookie = await login(base, "admin@service.example", password);
    const appointmentCookie = await login(base, "admin@appointments.example", password);
    const superCookie = await login(base, "owner", "OwnerPassword2026", true);

    let response = await fetch(base + "/admin/panel/appointment-calendar", { headers: { cookie: serviceCookie } });
    assert.strictEqual(response.status, 404);

    response = await fetch(base + "/admin/panel/appointment-calendar", { headers: { cookie: appointmentCookie } });
    assert.strictEqual(response.status, 200);
    let body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.authorization_available.google, true);
    assert.strictEqual(body.authorization_available.microsoft, true);
    assert.strictEqual(body.connection.status, "not_connected");
    assert.strictEqual(body.providers.length, 2);
    assert(!JSON.stringify(body).includes("google-calendar-secret"));

    response = await fetch(base + "/admin/panel/appointment-calendar/google/connect", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: appointmentCookie },
      body: "{}"
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.match(body.authorization_url, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
    assert.match(body.authorization_url, /calendar\.app\.created/);
    assert.doesNotMatch(body.authorization_url, /calendar\.events/);
    assert.match(body.authorization_url, /redirect_uri=/);

    response = await fetch(base + "/admin/panel/appointment-calendar/microsoft/connect", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: appointmentCookie },
      body: "{}"
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.match(body.authorization_url, /^https:\/\/login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize/);
    assert.match(body.authorization_url, /Calendars\.ReadWrite/);

    response = await fetch(base + "/admin/panel/channel-connections", { headers: { cookie: appointmentCookie } });
    assert.strictEqual(response.status, 200, "Appointment customers must also be able to connect WhatsApp via Meta");

    response = await fetch(base + "/admin/appointment-calendar-connections", { headers: { cookie: superCookie } });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.strictEqual(body.authorization_available.google, true);
    assert.strictEqual(body.authorization_available.microsoft, true);
    assert(body.calendars.some(function (row) { return row.tenant_id === "tenant-appointments"; }));

    response = await fetch(base + "/admin/appointment-calendar-connections/tenant-appointments/connect", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: superCookie },
      body: "{}"
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.match(body.authorization_url, /accounts\.google\.com/);

    response = await fetch(base + "/admin/appointment-calendar-connections/tenant-appointments/connect", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: superCookie },
      body: JSON.stringify({ provider: "microsoft" })
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.match(body.authorization_url, /login\.microsoftonline\.com/);
    console.log("appointment calendar e2e tests: ok");
  } finally {
    child.kill();
  }
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
