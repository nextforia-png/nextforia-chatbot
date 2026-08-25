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

async function login(base) {
  const response = await fetch(base + "/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ username: "owner@nextforia.example", password: "SuperAdminPassword2026" })
  });
  assert.strictEqual(response.status, 200);
  return String(response.headers.get("set-cookie") || "").split(";")[0];
}

async function loginCustomer(base) {
  const response = await fetch(base + "/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: "admin@cliente-produccion.example", password: "CustomerPassword2026" })
  });
  assert.strictEqual(response.status, 200);
  return String(response.headers.get("set-cookie") || "").split(";")[0];
}

function completedAnswers() {
  return {
    setup_goal: "customer_service",
    business: {
      brand_name: "Cliente Producción QA",
      contact_email: "admin@cliente-produccion.example",
      contact_phone: "+57 300 000 0000"
    },
    meta: { whatsapp_number: "+57 300 000 0000", whatsapp_integration_intent: "yes" },
    operations: {
      primary_country: "Colombia",
      primary_city: "Bogotá",
      monthly_customer_volume: "300",
      support_hours: "Lunes a viernes",
      services_products: "Servicios QA",
      frequent_questions: "Preguntas QA",
      important_policies: "Políticas QA",
      bot_instructions: "Responder con claridad"
    },
    customer_service_setup: {
      business_offer_type: "services",
      business_offer_description: "Servicios empresariales",
      ideal_customer: "Clientes que escriben por WhatsApp",
      value_proposition: "Respuesta inmediata",
      bot_display_name: "Nextfor QA",
      tone: "vendedor_dinamico",
      brand_restrictions: "No inventar precios",
      data_consent: true
    },
    appointment_setup: {
      business_category: "Servicios empresariales"
    },
    commerce: {
      platform: "none",
      integration_intent: "no"
    },
    team: {
      admin_email: "admin@cliente-produccion.example",
      human_support_contact: "Soporte QA"
    },
    voice: { formality: "cercano", emojis: "moderados" }
  };
}

(async function main() {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      DASHBOARD_KEY: "production-setup-bridge-key",
      DASHBOARD_SESSION_SECRET: "production-setup-bridge-session-secret",
      DASHBOARD_USERS: JSON.stringify([{
        username: "platform-owner",
        email: "owner@nextforia.example",
        password: "SuperAdminPassword2026",
        name: "Platform Owner",
        role: "super_admin"
      }]),
      VERIFY_TOKEN: "production-setup-verify",
      WA_TOKEN: "production-setup-wa-dummy",
      ANTHROPIC_API_KEY: "production-setup-anthropic-dummy",
      SUPABASE_URL: "",
      SUPABASE_KEY: "",
      CUSTOMER_ACCESS_V2_ENABLED: "1",
      CUSTOMER_ACCESS_TEST_MODE: "1",
      CUSTOMER_ACCESS_TEST_USERS: JSON.stringify([{
        user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        tenant_id: "cliente-producci-n-qa",
        company_name: "Cliente Producción QA",
        email: "admin@cliente-produccion.example",
        password: "CustomerPassword2026",
        role: "admin",
        plan_id: "nextfor-aura",
        assigned_bot_id: "atencion-cliente",
        setup_completed: false
      }]),
      CUSTOMER_PANEL_BASE_URL: "https://customer-panel.production-setup.example",
      PAYMENTS_V1_ENABLED: "0"
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);
    const cookie = await login(base);
    const customerCookie = await loginCustomer(base);
    let response = await fetch(base + "/admin/client-onboarding/data", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: base, cookie: customerCookie },
      body: JSON.stringify({ status: "completed", answers: completedAnswers() })
    });
    assert.strictEqual(response.status, 200);
    let payload = await response.json();
    assert.strictEqual(payload.onboarding.tenant_id, "cliente-producci-n-qa");
    assert.strictEqual(payload.onboarding.setup_completed, true);
    assert.strictEqual(payload.onboarding.completion, 100);

    response = await fetch(base + "/admin/leads", { headers: { cookie } });
    assert.strictEqual(response.status, 200);
    payload = await response.json();
    assert(payload.leads.rows.some(function (row) {
      return row.tenant_id === "cliente-producci-n-qa" &&
        row.company_name === "Cliente Producción QA" &&
        row.completion === 100 &&
        row.setup_completed === true;
    }), "completed setup must appear in Super Admin leads without customer access v2");

    response = await fetch(base + "/admin/customer-setups", { headers: { cookie } });
    assert.strictEqual(response.status, 200);
    payload = await response.json();
    assert(payload.setups.some(function (row) {
      return row.tenant_id === "cliente-producci-n-qa" &&
        row.company_name === "Cliente Producción QA" &&
        row.completion === 100 &&
        row.setup_completed === true &&
        row.review.status === "ready";
    }), "completed setup must appear in Super Admin setup review without customer access v2");

    response = await fetch(base + "/admin/customer-setups/cliente-producci-n-qa", { headers: { cookie } });
    assert.strictEqual(response.status, 200);
    payload = await response.json();
    assert(Array.isArray(payload.channels), "setup detail exposes real channel connection states when available");
    assert.strictEqual(payload.onboarding.answers.meta.whatsapp_number, "+57 300 000 0000");
    assert.strictEqual(payload.onboarding.answers.commerce.platform, "none");
    assert.strictEqual(payload.onboarding.customer_service_configuration.lifecycle, "draft");
    assert(payload.review.history.some(function (event) {
      return event.action === "auto_build_configuration";
    }));

    console.log("production-setup-bridge.e2e.test.js: ok");
  } finally {
    child.kill();
  }
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
