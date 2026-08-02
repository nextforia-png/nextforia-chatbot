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

async function login(base, body) {
  const response = await fetch(base + "/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify(body)
  });
  assert.strictEqual(response.status, 200);
  return {
    body: await response.json(),
    cookie: String(response.headers.get("set-cookie") || "").split(";")[0]
  };
}

(async function run() {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const encryptionKey = crypto.randomBytes(32).toString("base64url");
  const fixtures = [
    { user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenant_id: "tenant-a", company_name: "Empresa A", email: "admin@a.example", password: "TenantPassword2026", role: "admin" },
    { user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", tenant_id: "tenant-b", company_name: "Empresa B", email: "admin@b.example", password: "TenantPassword2026", role: "admin" },
    { user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", tenant_id: "tenant-c", company_name: "Agenda C", email: "admin@c.example", password: "TenantPassword2026", role: "admin", plan_id: "nextfor-tempo", assigned_bot_id: "agendamiento" },
    { user_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", tenant_id: "rav-customer-account", company_name: "RAV Toys", email: "admin@ravtoys.example", password: "TenantPassword2026", role: "admin" }
  ];
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      DASHBOARD_KEY: "channel-e2e-dashboard-key",
      DASHBOARD_SESSION_SECRET: "channel-e2e-session-secret-value-long",
      DASHBOARD_USERS: JSON.stringify([
        { username: "owner", email: "owner@nextforia.test", password: "OwnerPassword2026", role: "super_admin", name: "Owner" }
      ]),
      VERIFY_TOKEN: "channel-e2e-verify",
      WA_TOKEN: "channel-e2e-wa-legacy",
      PHONE_NUMBER_ID: "rav-phone-id",
      TENANT_DISPLAY_PHONE: "+57 301 000 0000",
      ANTHROPIC_API_KEY: "channel-e2e-anthropic",
      DATA_ENCRYPTION_KEY: encryptionKey,
      CUSTOMER_ACCESS_V2_ENABLED: "1",
      CUSTOMER_ACCESS_TEST_MODE: "1",
      CUSTOMER_ACCESS_TEST_USERS: JSON.stringify(fixtures),
      PUBLIC_BASE_URL: "https://rav-whatsapp-bot.onrender.com",
      CUSTOMER_PANEL_BASE_URL: "https://rav-whatsapp-bot.onrender.com",
      CHANNEL_CONNECTIONS_V1_ENABLED: "1",
      CHANNEL_CONNECTIONS_TEST_MODE: "1",
      CHANNEL_CONNECTION_INTERNAL_TENANT_ALIASES: JSON.stringify({
        "rav-customer-account": "rav-toys"
      }),
      META_APP_ID: "123456789",
      META_APP_SECRET: "channel-e2e-meta-app-secret-value",
      META_WHATSAPP_CONFIG_ID: "channel-e2e-whatsapp-config",
      META_GRAPH_VERSION: "v23.0",
      SUPABASE_URL: "",
      SUPABASE_KEY: ""
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);
    let response = await fetch(base + "/admin/health");
    assert.strictEqual(response.status, 200);
    let body = await response.json();
    assert.strictEqual(body.customer_setup.meta_oauth_ready, true);
    assert.strictEqual(body.customer_setup.channel_storage_ready, false);
    assert.strictEqual(body.customer_setup.shopify_install_ready, false);
    assert(!JSON.stringify(body).includes("channel-e2e-meta-app-secret-value"));

    const userA = await login(base, { email: "admin@a.example", password: "TenantPassword2026" });
    const userB = await login(base, { email: "admin@b.example", password: "TenantPassword2026" });
    const appointmentUser = await login(base, { email: "admin@c.example", password: "TenantPassword2026" });
    const ravCustomer = await login(base, { email: "admin@ravtoys.example", password: "TenantPassword2026" });
    const superAdmin = await login(base, { username: "owner@nextforia.test", password: "OwnerPassword2026" });
    response = await fetch(base + "/admin/panel?tab=channels", { headers: { cookie: userA.cookie } });
    assert.strictEqual(response.status, 200);
    const panel = await response.text();
    assert(panel.includes("Finaliza el entrenamiento de tu Nextfor"));
    assert(panel.includes('id="connectionHubSummary"'));
    assert(panel.includes('id="channelConnectionCards"'));
    assert(panel.includes('id="commerceConnectorCards"'));
    assert(panel.includes("Conecta tu tienda"));
    assert(panel.includes("Hacer esto más tarde"));
    assert(!panel.toLowerCase().includes("access token"));

    response = await fetch(base + "/admin/panel?tab=channels", { headers: { cookie: appointmentUser.cookie } });
    assert.strictEqual(response.status, 200);
    const appointmentPanel = await response.text();
    assert(appointmentPanel.includes("Conectar canales"));
    assert(appointmentPanel.includes("Finaliza el entrenamiento de tu Nextfor"));
    response = await fetch(base + "/admin/panel/channel-connections", { headers: { cookie: appointmentUser.cookie } });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.strictEqual(body.appointment_calendar.name, "Google Calendar");
    assert.strictEqual(body.appointment_calendar.status, "not_connected");
    assert.strictEqual(body.appointment_calendar.authorization_available, false);
    assert(!JSON.stringify(body).includes("google-calendar-secret"));

    response = await fetch(base + "/admin/panel/channel-connections?tenant_id=tenant-b", {
      headers: { cookie: userA.cookie }
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.strictEqual(body.appointment_calendar, null);
    assert.deepStrictEqual(body.channels.map(function (row) { return row.name; }), [
      "WhatsApp", "Instagram", "Facebook Messenger"
    ]);
    assert(body.channels.every(function (row) { return row.tenant_id === "tenant-a"; }));
    assert(!JSON.stringify(body).includes("tenant-b"));

    response = await fetch(base + "/admin/panel/channel-connections", {
      headers: { cookie: ravCustomer.cookie }
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    const ravWhatsapp = body.channels.find(function (row) { return row.channel === "whatsapp"; });
    assert.strictEqual(ravWhatsapp.tenant_id, "rav-customer-account");
    assert.strictEqual(ravWhatsapp.status, "not_connected");
    assert.strictEqual(ravWhatsapp.account_label, null);
    assert.strictEqual(ravWhatsapp.connect_available, true);
    assert.strictEqual(ravWhatsapp.disconnect_available, false);

    response = await fetch(base + "/admin/send-message", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: userA.cookie },
      body: JSON.stringify({ userId: "ig:123456789", text: "Prueba de entrega" })
    });
    assert.strictEqual(response.status, 502, "a rejected Meta delivery must never look successful");
    body = await response.json();
    assert.strictEqual(body.error, "channel_delivery_failed");
    assert.strictEqual(body.meta_sent, false);
    response = await fetch(base + "/admin/panel/data?limit=500", { headers: { cookie: userA.cookie } });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert(!JSON.stringify(body).includes("Prueba de entrega"), "a rejected reply must not appear as a sent message");
    assert(!JSON.stringify(body).includes("DeliveryFailure"), "delivery audit rows must stay internal");

    response = await fetch(base + "/admin/takeover/ig%3A123456789", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: userA.cookie },
      body: "{}"
    });
    assert.strictEqual(response.status, 200);
    response = await fetch(base + "/admin/release/ig%3A123456789", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: userB.cookie },
      body: "{}"
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.strictEqual(body.wasInHandoff, false, "tenant B must not release tenant A's handoff state");
    response = await fetch(base + "/admin/release/ig%3A123456789", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: userA.cookie },
      body: "{}"
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.strictEqual(body.wasInHandoff, true, "tenant A must retain its own handoff state");

    response = await fetch(base + "/admin/customer-meta/ig%3A123456789", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: userA.cookie },
      body: JSON.stringify({ tags: ["vip"], note: "Solo Empresa A", name: "Cliente A" })
    });
    assert.strictEqual(response.status, 200);
    response = await fetch(base + "/admin/panel/data?limit=500", { headers: { cookie: userA.cookie } });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert(JSON.stringify(body).includes("Solo Empresa A"));
    response = await fetch(base + "/admin/panel/data?limit=500", { headers: { cookie: userB.cookie } });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert(!JSON.stringify(body).includes("Solo Empresa A"), "tenant metadata must not leak across companies");

    response = await fetch(base + "/admin/panel/channel-connections/whatsapp/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://nextforia.com",
        "x-nextforia-panel-origin": "https://nextforia.com",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "nextforia.com",
        cookie: ravCustomer.cookie
      },
      body: "{}"
    });
    assert.strictEqual(response.status, 200, "RAV customer must connect its own tenant-scoped WhatsApp account");
    body = await response.json();
    assert.strictEqual(body.embedded_signup.app_id, "123456789");
    assert.strictEqual(body.embedded_signup.configuration_id, "channel-e2e-whatsapp-config");
    assert.strictEqual(body.embedded_signup.graph_version, "v23.0");
    assert(body.embedded_signup.oauth_state);
    assert(!JSON.stringify(body).includes("channel-e2e-meta-app-secret-value"));

    response = await fetch(base + "/admin/panel/channel-connections/whatsapp/complete", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: ravCustomer.cookie },
      body: JSON.stringify({
        state: body.embedded_signup.oauth_state + "altered",
        code: "fake",
        session: { waba_id: "waba-a", phone_number_id: "phone-a" }
      })
    });
    assert.strictEqual(response.status, 403);

    response = await fetch(base + "/admin/panel/channel-connections/instagram/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://nextforia.com",
        "x-nextforia-panel-origin": "https://nextforia.com",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "nextforia.com",
        cookie: userA.cookie
      },
      body: JSON.stringify({ tenant_id: "tenant-b" })
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    const authorization = new URL(body.authorization_url);
    assert.strictEqual(authorization.hostname, "www.instagram.com");
    assert.strictEqual(authorization.searchParams.get("redirect_uri"), "https://nextforia.com/admin/channel-connections/meta/callback/");
    assert(authorization.searchParams.get("scope").includes("instagram_business_manage_messages"));
    assert(!authorization.searchParams.get("scope").includes("pages_show_list"));
    assert(!body.authorization_url.includes("channel-e2e-meta-app-secret-value"));

    response = await fetch(base + "/admin/panel/channel-connections", { headers: { cookie: userA.cookie } });
    body = await response.json();
    assert.strictEqual(body.channels.find(function (row) { return row.channel === "instagram"; }).status, "connecting");

    response = await fetch(base + "/admin/panel/channel-connections", { headers: { cookie: userB.cookie } });
    body = await response.json();
    assert.strictEqual(body.channels.find(function (row) { return row.channel === "instagram"; }).status, "not_connected");
    assert(!JSON.stringify(body).includes("tenant-a"));

    response = await fetch(base + "/admin/panel/channel-connections/instagram/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: userB.cookie },
      body: JSON.stringify({ tenant_id: "tenant-a" })
    });
    assert.strictEqual(response.status, 404, "tenant B cannot disconnect tenant A's connection");

    response = await fetch(base + "/admin/panel/channel-connections/instagram/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: userA.cookie },
      body: JSON.stringify({ tenant_id: "tenant-b" })
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual((await response.json()).connection.status, "disconnected");

    response = await fetch(base + "/admin/channel-connections/meta/callback?state=altered&code=fake");
    assert.strictEqual(response.status, 200);
    assert(response.url.includes("connection=error"));

    response = await fetch(base + "/admin/channel-connections", { headers: { cookie: userA.cookie } });
    assert.strictEqual(response.status, 401);
    response = await fetch(base + "/admin/channel-connections", { headers: { cookie: superAdmin.cookie } });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert(body.channels.some(function (row) {
      return row.tenant_id === "rav-toys" && row.channel === "whatsapp" && row.protected_legacy;
    }));
    assert(!JSON.stringify(body).toLowerCase().includes("access_token"));
    assert(!JSON.stringify(body).includes("channel-e2e-wa-legacy"));
    assert(!JSON.stringify(body).includes(encryptionKey));

    response = await fetch(base + "/admin/super-admin?view=channels", { headers: { cookie: superAdmin.cookie } });
    assert.strictEqual(response.status, 200);
    const superPanel = await response.text();
    assert(superPanel.includes('data-panel="channels"'));
    assert(superPanel.includes("Los tokens nunca salen del almacenamiento cifrado"));
    assert(!superPanel.includes("channel-e2e-wa-legacy"));
    assert(!superPanel.includes(encryptionKey));

    response = await fetch(base + "/admin/channel-connections/tenant-a/whatsapp/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://nextforia.com",
        "x-nextforia-panel-origin": "https://nextforia.com",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "nextforia.com",
        cookie: superAdmin.cookie
      },
      body: "{}"
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    const superAdminAuthorization = new URL(body.authorization_url);
    assert.strictEqual(superAdminAuthorization.hostname, "www.facebook.com");
    assert(superAdminAuthorization.searchParams.get("scope").includes("whatsapp_business_management"));
    const superAdminState = decodeURIComponent(superAdminAuthorization.searchParams.get("state"));
    assert(!body.authorization_url.includes("channel-e2e-meta-app-secret-value"));
    response = await fetch(base + "/admin/channel-connections", { headers: { cookie: superAdmin.cookie } });
    body = await response.json();
    assert.strictEqual(body.channels.find(function (row) {
      return row.tenant_id === "tenant-a" && row.channel === "whatsapp";
    }).status, "connecting");

    response = await fetch(base + "/admin/channel-connections/rav-toys/whatsapp/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, cookie: superAdmin.cookie },
      body: "{}"
    });
    assert.strictEqual(response.status, 409);
    assert.strictEqual((await response.json()).error, "legacy_connection_protected");

    console.log("channel-connections.e2e.test.js: ok");
  } finally {
    child.kill("SIGTERM");
  }
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
