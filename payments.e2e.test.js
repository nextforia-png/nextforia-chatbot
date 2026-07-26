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

async function login(base, email, password) {
  const response = await fetch(base + "/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, password })
  });
  assert.strictEqual(response.status, 200);
  return String(response.headers.get("set-cookie") || "").split(";")[0];
}

function signEvent(event, secret) {
  const concatenated = event.signature.properties.map(function (property) {
    return String(property.split(".").reduce(function (value, key) { return value[key]; }, event.data));
  }).join("") + String(event.timestamp) + secret;
  event.signature.checksum = crypto.createHash("sha256").update(concatenated).digest("hex");
  return event;
}

function transactionEvent(input) {
  return signEvent({
    event: "transaction.updated",
    data: {
      transaction: {
        id: input.id,
        reference: input.reference,
        status: input.status,
        amount_in_cents: input.amount_in_cents,
        created_at: "2026-07-25T16:00:00.000Z",
        finalized_at: input.status === "APPROVED" ? "2026-07-25T16:00:05.000Z" : null
      }
    },
    environment: "test",
    signature: {
      properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
      checksum: ""
    },
    timestamp: input.timestamp,
    sent_at: "2026-07-25T16:00:06.000Z"
  }, "test_events_e2e");
}

(async function run() {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const password = "TenantPassword2026";
  const fixtures = [
    {
      tenant_id: "payments-a",
      company_name: "Payments Customer A",
      email: "payments-a@example.com",
      password,
      role: "admin",
      plan_id: "growth",
      assigned_bot_id: "atencion-cliente",
      setup_completed: true
    },
    {
      tenant_id: "payments-b",
      company_name: "Payments Customer B",
      email: "payments-b@example.com",
      password,
      role: "admin",
      plan_id: "scale",
      assigned_bot_id: "agendamiento",
      setup_completed: true
    },
    {
      tenant_id: "payments-setup",
      company_name: "Payments Setup",
      email: "payments-setup@example.com",
      password,
      role: "admin",
      plan_id: "growth",
      assigned_bot_id: "atencion-cliente",
      setup_completed: false
    }
  ];
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      PUBLIC_BASE_URL: "https://staging.nextforia.example",
      DASHBOARD_KEY: "payments-super-admin-key",
      DASHBOARD_SESSION_SECRET: "payments-session-secret",
      DASHBOARD_USERS: "[]",
      VERIFY_TOKEN: "payments-verify",
      WA_TOKEN: "payments-wa-dummy",
      ANTHROPIC_API_KEY: "payments-anthropic-dummy",
      SUPABASE_URL: "",
      SUPABASE_KEY: "",
      CUSTOMER_ACCESS_V2_ENABLED: "1",
      CUSTOMER_ACCESS_TEST_MODE: "1",
      CUSTOMER_ACCESS_TEST_USERS: JSON.stringify(fixtures),
      CUSTOMER_PANEL_BASE_URL: "https://customer-panel.staging.example",
      PAYMENTS_V1_ENABLED: "1",
      PAYMENTS_TEST_MODE: "1",
      PAYMENTS_ENV: "staging",
      WOMPI_PUBLIC_KEY: "pub_test_e2e",
      WOMPI_INTEGRITY_SECRET: "test_integrity_e2e",
      WOMPI_EVENT_SECRET: "test_events_e2e",
      WOMPI_ESTIMATED_FEE_RATE: "0.03"
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);
    const keyHeaders = {
      "content-type": "application/json",
      "x-dashboard-key": "payments-super-admin-key"
    };

    let response = await fetch(base + "/admin/catalogs/plans", {
      method: "POST",
      headers: keyHeaders,
      body: JSON.stringify({
        id: "growth",
        nombre: "Growth",
        bot_id: "atencion-cliente",
        precio_setup: 300000,
        precio_mensual: 180000,
        chats_incluidos: 500
      })
    });
    assert.strictEqual(response.status, 200);
    response = await fetch(base + "/admin/catalogs/plans", {
      method: "POST",
      headers: keyHeaders,
      body: JSON.stringify({
        id: "scale",
        nombre: "Scale Agenda",
        bot_id: "agendamiento",
        precio_setup: 250000,
        precio_mensual: 150000,
        chats_incluidos: 900
      })
    });
    assert.strictEqual(response.status, 200);

    const cookieA = await login(base, fixtures[0].email, password);
    const cookieB = await login(base, fixtures[1].email, password);
    const cookieSetup = await login(base, fixtures[2].email, password);

    response = await fetch(base + "/admin/client-onboarding", { headers: { cookie: cookieSetup } });
    assert.strictEqual(response.status, 200);
    const setupHtml = await response.text();
    assert(setupHtml.includes("Elige el bot para tu empresa"));
    assert(setupHtml.includes("Elige cómo activar tu plan"));
    assert(setupHtml.includes("Pagar con Wompi"));
    assert(setupHtml.includes("Los precios provienen del catálogo central."));

    response = await fetch(base + "/admin/panel/billing/checkout", {
      method: "POST",
      headers: { cookie: cookieA, origin: base, "content-type": "application/json" },
      body: JSON.stringify({
        plan_id: "scale",
        bot_id: "agendamiento",
        tenant_id: "payments-b"
      })
    });
    assert.strictEqual(response.status, 200);
    let payload = await response.json();
    const checkoutA = payload.checkout;
    assert.strictEqual(checkoutA.amount_charged, 480000);
    assert.strictEqual(checkoutA.reference.includes("payments-a"), true,
      "checkout must remain bound to the authenticated tenant and its catalog selection");
    assert(checkoutA.checkout_url.startsWith("https://checkout.wompi.co/p/?"));

    response = await fetch(base + "/admin/panel/billing", { headers: { cookie: cookieA } });
    payload = await response.json();
    assert.strictEqual(payload.billing.payment_status, "pending");
    assert.strictEqual(payload.billing.ready_for_bot_creation, false);
    assert.strictEqual(payload.billing.contracted_setup_price, 300000);

    response = await fetch(base + "/admin/panel/billing", { headers: { cookie: cookieB } });
    payload = await response.json();
    assert.strictEqual(payload.billing, null, "Customer B must not see Customer A billing");

    const approved = transactionEvent({
      id: "e2e-approved-a",
      reference: checkoutA.reference,
      status: "APPROVED",
      amount_in_cents: 48000000,
      timestamp: 1753459200
    });
    response = await fetch(base + "/webhooks/wompi", {
      method: "POST",
      headers: { "content-type": "application/json", "x-event-checksum": approved.signature.checksum },
      body: JSON.stringify(approved)
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual((await response.json()).duplicate, false);
    response = await fetch(base + "/webhooks/wompi", {
      method: "POST",
      headers: { "content-type": "application/json", "x-event-checksum": approved.signature.checksum },
      body: JSON.stringify(approved)
    });
    assert.strictEqual((await response.json()).duplicate, true);

    response = await fetch(base + "/admin/panel/billing", { headers: { cookie: cookieA } });
    payload = await response.json();
    assert.strictEqual(payload.billing.payment_status, "paid");
    assert.strictEqual(payload.billing.subscription_status, "active");
    assert.strictEqual(payload.billing.ready_for_bot_creation, true);
    assert.strictEqual(payload.billing.provider_fee_type, "estimated");
    assert.strictEqual(payload.billing.provider_fee, 14400);
    assert.strictEqual(payload.billing.net_amount, 465600);
    assert.strictEqual(payload.billing.history.length, 1);

    response = await fetch(base + "/admin/panel/billing/checkout", {
      method: "POST",
      headers: { cookie: cookieB, origin: base, "content-type": "application/json" },
      body: JSON.stringify({ plan_id: "scale", bot_id: "agendamiento" })
    });
    const checkoutB = (await response.json()).checkout;
    const failed = transactionEvent({
      id: "e2e-failed-b",
      reference: checkoutB.reference,
      status: "DECLINED",
      amount_in_cents: 40000000,
      timestamp: 1753459800
    });
    response = await fetch(base + "/webhooks/wompi", {
      method: "POST",
      headers: { "content-type": "application/json", "x-event-checksum": failed.signature.checksum },
      body: JSON.stringify(failed)
    });
    assert.strictEqual(response.status, 200);
    response = await fetch(base + "/admin/panel/billing", { headers: { cookie: cookieB } });
    payload = await response.json();
    assert.strictEqual(payload.billing.payment_status, "failed");
    assert.notStrictEqual(payload.billing.subscription_status, "active");
    assert.strictEqual(payload.billing.ready_for_bot_creation, false);

    response = await fetch(base + "/admin/billing/payments-b/bypass", {
      method: "POST",
      headers: keyHeaders,
      body: JSON.stringify({
        subscription_status: "pilot",
        reason: "Piloto comercial aprobado para staging"
      })
    });
    assert.strictEqual(response.status, 200);
    payload = await response.json();
    assert.strictEqual(payload.billing.subscription_status, "pilot");
    assert.strictEqual(payload.billing.ready_for_bot_creation, true);
    assert.strictEqual(payload.billing.bypass_reason, "Piloto comercial aprobado para staging");

    response = await fetch(base + "/admin/billing", {
      headers: { "x-dashboard-key": "payments-super-admin-key" }
    });
    payload = await response.json();
    assert.strictEqual(payload.billing.length, 2);
    const adminA = payload.billing.find(function (row) { return row.tenant_id === "payments-a"; });
    assert.strictEqual(adminA.net_amount, 465600);
    assert.strictEqual(adminA.history.length, 1);

    response = await fetch(base + "/admin/panel?tab=plan", { headers: { cookie: cookieA } });
    const customerHtml = await response.text();
    assert(customerHtml.includes("Facturación de mi plan"));
    assert(customerHtml.includes("/admin/panel/billing"));

    response = await fetch(base + "/admin/super-admin", {
      headers: { "x-dashboard-key": "payments-super-admin-key" }
    });
    const superAdminHtml = await response.text();
    assert(superAdminHtml.includes("Payments v1 · Wompi Sandbox"));
    assert(superAdminHtml.includes("Contratos y pagos"));
    assert(superAdminHtml.includes("Aprobar piloto"));

    console.log("payments e2e tests passed");
  } finally {
    child.kill("SIGTERM");
  }
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
