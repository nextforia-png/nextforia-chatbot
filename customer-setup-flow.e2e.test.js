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

function completedAnswers(company, email, marker) {
  return {
    business: {
      brand_name: company,
      contact_email: email,
      contact_phone: "+57 300 000 0000"
    },
    meta: { whatsapp_number: "+57 300 000 0000" },
    operations: {
      business_hours: "Lunes a viernes",
      services_products: "Servicios " + marker,
      frequent_questions: "Preguntas " + marker,
      important_policies: "Políticas " + marker,
      bot_instructions: "Responder como " + marker
    },
    team: {
      admin_email: email,
      human_support_contact: "Soporte " + marker
    },
    voice: { formality: "cercano", emojis: "moderados" }
  };
}

(async function run() {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const password = "TenantPassword2026";
  const fixtures = [
    {
      user_id: "11111111-1111-4111-8111-111111111111",
      tenant_id: "tenant-setup-a",
      company_name: "Empresa Setup A",
      email: "admin@setup-a.example",
      password,
      role: "admin",
      plan_id: "growth",
      assigned_bot_id: "atencion-cliente",
      setup_completed: false
    },
    {
      user_id: "22222222-2222-4222-8222-222222222222",
      tenant_id: "tenant-returning-b",
      company_name: "Empresa Returning B",
      email: "admin@returning-b.example",
      password,
      role: "admin",
      plan_id: "scale",
      assigned_bot_id: "agendamiento",
      setup_completed: true
    }
  ];
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      DASHBOARD_KEY: "customer-setup-key",
      DASHBOARD_SESSION_SECRET: "customer-setup-session-secret",
      DASHBOARD_USERS: "[]",
      VERIFY_TOKEN: "customer-setup-verify",
      WA_TOKEN: "customer-setup-wa-dummy",
      ANTHROPIC_API_KEY: "customer-setup-anthropic-dummy",
      SUPABASE_URL: "",
      SUPABASE_KEY: "",
      CUSTOMER_ACCESS_V2_ENABLED: "1",
      CUSTOMER_ACCESS_TEST_MODE: "1",
      CUSTOMER_ACCESS_TEST_USERS: JSON.stringify(fixtures),
      CUSTOMER_PANEL_BASE_URL: "https://customer-panel.staging.example"
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);
    const cookieA = await login(base, fixtures[0].email, password);
    const cookieB = await login(base, fixtures[1].email, password);

    let response = await fetch(base + "/admin/panel?tab=summary", {
      headers: { cookie: cookieA },
      redirect: "manual"
    });
    assert.strictEqual(response.status, 302, "a new customer must enter setup before the panel");
    assert.strictEqual(response.headers.get("location"), "/admin/client-onboarding");

    response = await fetch(base + "/admin/client-onboarding", { headers: { cookie: cookieA } });
    assert.strictEqual(response.status, 200);
    const setupHtml = await response.text();
    assert(setupHtml.includes("Configurar mi asistente"));
    assert(setupHtml.includes("Empresa Setup A"));
    assert(setupHtml.includes("admin@setup-a.example"));
    assert(setupHtml.includes("Growth"));
    assert(setupHtml.includes("Atención al cliente"));
    assert(setupHtml.includes("Información comercial de solo lectura"));
    assert(!setupHtml.includes("Empresa Returning B"));
    assert(!setupHtml.includes("$299.900"), "prices must not be hardcoded in setup");

    response = await fetch(base + "/admin/client-onboarding/data?tenant_id=tenant-returning-b", {
      headers: { cookie: cookieA }
    });
    assert.strictEqual(response.status, 200);
    let payload = await response.json();
    assert.strictEqual(payload.tenant.id, "tenant-setup-a");
    assert.strictEqual(payload.onboarding.setup_completed, false);
    assert(payload.questionnaire.questions.some(function (question) { return question.id === "bot_communication_instructions"; }));

    const draft = completedAnswers("Empresa Setup A", fixtures[0].email, "A");
    draft.operations.important_policies = "";
    response = await fetch(base + "/admin/client-onboarding/data?tenant_id=tenant-returning-b", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: base, cookie: cookieA },
      body: JSON.stringify({ tenant_id: "tenant-returning-b", status: "draft", answers: draft })
    });
    assert.strictEqual(response.status, 200);
    payload = await response.json();
    assert.strictEqual(payload.onboarding.tenant_id, "tenant-setup-a");
    assert.strictEqual(payload.onboarding.setup_completed, false);
    assert.strictEqual(payload.onboarding.answers.operations.services_products, "Servicios A");
    assert(payload.onboarding.last_updated_at);

    response = await fetch(base + "/admin/client-onboarding/data", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: base, cookie: cookieA },
      body: JSON.stringify({ status: "completed", answers: draft })
    });
    assert.strictEqual(response.status, 422);
    assert.strictEqual((await response.json()).error, "setup_incomplete");

    response = await fetch(base + "/admin/client-onboarding/data", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: base, cookie: cookieA },
      body: JSON.stringify({ status: "completed", answers: completedAnswers("Empresa Setup A", fixtures[0].email, "A") })
    });
    assert.strictEqual(response.status, 200);
    payload = await response.json();
    assert.strictEqual(payload.onboarding.setup_completed, true);
    assert(payload.onboarding.setup_completed_at);
    assert.strictEqual(payload.redirect, "/admin/panel?tab=summary");

    response = await fetch(base + "/admin/panel?tab=summary", {
      headers: { cookie: cookieA },
      redirect: "manual"
    });
    assert.strictEqual(response.status, 200, "completed setup must open the normal panel");
    const panelA = await response.text();
    assert(panelA.includes("Empresa Setup A"));
    assert(panelA.includes('id="setupHomeCard" hidden'), "completed setup must not show a second onboarding reminder");

    response = await fetch(base + "/admin/client-onboarding", {
      headers: { cookie: cookieA },
      redirect: "manual"
    });
    assert.strictEqual(response.status, 302, "completed customers must not repeat onboarding");
    assert.strictEqual(response.headers.get("location"), "/admin/panel?tab=summary");

    response = await fetch(base + "/admin/panel?tab=summary", {
      headers: { cookie: cookieB },
      redirect: "manual"
    });
    assert.strictEqual(response.status, 200, "returning customers skip setup");
    const panelB = await response.text();
    assert(panelB.includes("Empresa Returning B"));
    assert(!panelB.includes("Empresa Setup A"));
    assert(panelB.includes('id="setupHomeCard" hidden'));

    response = await fetch(base + "/admin/client-onboarding/data?tenant_id=tenant-setup-a", {
      headers: { cookie: cookieB }
    });
    payload = await response.json();
    assert.strictEqual(payload.tenant.id, "tenant-returning-b");
    assert(!JSON.stringify(payload).includes("Servicios A"), "tenant B cannot infer tenant A setup");

    console.log("customer-setup-flow.e2e.test.js: ok");
  } finally {
    child.kill("SIGTERM");
  }
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
