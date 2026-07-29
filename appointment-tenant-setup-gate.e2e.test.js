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

function appointmentAnswers(company) {
  return {
    setup_goal: "appointments",
    meta: {
      whatsapp_number: "+57 300 222 3333"
    },
    operations: {
      monthly_customer_volume: "180"
    },
    appointment_setup: {
      business_name: company,
      business_category: "salud_bienestar",
      target_customer: "Pacientes que quieren reservar consulta",
      business_description: "Atendemos de forma cercana y explicamos cada procedimiento antes de reservar.",
      assistant_tone: "calido_empatico",
      bot_display_name: "Luciana",
      allowed_topics: "Servicios, precios, horarios y disponibilidad",
      forbidden_topics: "Diagnósticos, recomendaciones médicas y promesas de resultado",
      escalation_triggers: "Urgencias, quejas o cuando no pueda responder con seguridad",
      escalation_contact: "Recepción +57 300 000 0000",
      human_support_hours: "Lunes a viernes",
      services: "Consulta inicial · 45 minutos · precio por confirmar",
      business_hours: "Lunes a viernes de 8 a 6",
      payment_methods: "Efectivo, transferencia y tarjeta",
      faqs: "¿Cuánto dura? 45 minutos.",
      staff_mode: "one",
      appointment_locations: "Sede principal y virtual",
      availability_rules: "Lunes a viernes de 9 a 5",
      required_booking_fields: "Nombre completo, teléfono, servicio deseado y horario preferido",
      booking_confirmation_mode: "manual_approval",
      cancellation_policy: "Cancelar mínimo 12 horas antes",
      calendar_provider: "google",
      reminder_channel: "whatsapp",
      reminder_timing: "24h",
      survey_enabled: "yes",
      operational_channels: "WhatsApp activo",
      channel_email: "agenda@example.com",
      data_consent: true
    }
  };
}

(async function run() {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const password = "TenantPassword2026";
  const fixtures = [
    {
      user_id: "33333333-3333-4333-8333-333333333333",
      tenant_id: "tenant-appointments-c",
      company_name: "Empresa Citas C",
      email: "admin@citas-c.example",
      password,
      role: "admin",
      plan_id: "nextfor-tempo",
      assigned_bot_id: "agendamiento",
      setup_completed: false
    },
    {
      user_id: "11111111-1111-4111-8111-111111111111",
      tenant_id: "tenant-setup-a",
      company_name: "Empresa Setup A",
      email: "admin@setup-a.example",
      password,
      role: "admin",
      plan_id: "nextfor-aura",
      assigned_bot_id: "atencion-cliente",
      setup_completed: false
    }
  ];
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      DASHBOARD_KEY: "appointment-tenant-gate-key",
      DASHBOARD_SESSION_SECRET: "appointment-tenant-gate-session-secret",
      VERIFY_TOKEN: "appointment-tenant-gate-verify",
      WA_TOKEN: "appointment-tenant-gate-wa-dummy",
      ANTHROPIC_API_KEY: "appointment-tenant-gate-anthropic-dummy",
      SUPABASE_URL: "",
      SUPABASE_KEY: "",
      CUSTOMER_ACCESS_V2_ENABLED: "1",
      CUSTOMER_ACCESS_TEST_MODE: "1",
      CUSTOMER_ACCESS_TEST_USERS: JSON.stringify(fixtures),
      CUSTOMER_PANEL_BASE_URL: "https://customer-panel.staging.example",
      APPOINTMENT_SETUP_ENABLED: "0",
      APPOINTMENT_SETUP_TENANT_IDS: "tenant-appointments-c"
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);

    const pilotCookie = await login(base, "admin@citas-c.example", password);
    let response = await fetch(base + "/admin/client-onboarding", { headers: { cookie: pilotCookie } });
    assert.strictEqual(response.status, 200);
    const pilotHtml = await response.text();
    assert(pilotHtml.includes('name="setupGoal" data-field="setup_goal" value="appointments"'));
    assert(pilotHtml.includes('name="selected_plan" value="nextfor-tempo"'));
    assert(pilotHtml.includes("Bot de Agendamiento") || pilotHtml.includes("Agendamiento"));

    response = await fetch(base + "/admin/panel/catalogs", { headers: { cookie: pilotCookie } });
    assert.strictEqual(response.status, 200);
    let body = await response.json();
    assert(body.plans.some(function (plan) { return plan.id === "nextfor-tempo"; }));
    assert(body.bots.some(function (bot) { return bot.id === "agendamiento"; }));

    response = await fetch(base + "/admin/client-onboarding/data", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: base, cookie: pilotCookie },
      body: JSON.stringify({
        status: "completed",
        plan_id: "nextfor-tempo",
        bot_id: "agendamiento",
        answers: appointmentAnswers("Empresa Citas C")
      })
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.strictEqual(body.onboarding.answers.setup_goal, "appointments");
    assert.strictEqual(body.selected_plan_id, "nextfor-tempo");
    assert.strictEqual(body.selected_bot_id, "agendamiento");

    const controlCookie = await login(base, "admin@setup-a.example", password);
    response = await fetch(base + "/admin/client-onboarding", { headers: { cookie: controlCookie } });
    assert.strictEqual(response.status, 200);
    const controlHtml = await response.text();
    assert(!controlHtml.includes('name="setupGoal" data-field="setup_goal" value="appointments"'));
    assert(!controlHtml.includes('name="selected_plan" value="nextfor-tempo"'));

    response = await fetch(base + "/admin/panel/catalogs", { headers: { cookie: controlCookie } });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert(!body.plans.some(function (plan) { return plan.id === "nextfor-tempo"; }));
    assert(!body.bots.some(function (bot) { return bot.id === "agendamiento"; }));

    response = await fetch(base + "/admin/client-onboarding/data", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: base, cookie: controlCookie },
      body: JSON.stringify({
        status: "completed",
        plan_id: "nextfor-tempo",
        bot_id: "agendamiento",
        answers: appointmentAnswers("Empresa Setup A")
      })
    });
    assert.strictEqual(response.status, 422);
    body = await response.json();
    assert.strictEqual(body.error, "chatbot_only_release");

    console.log("appointment tenant setup gate e2e tests: ok");
  } finally {
    child.kill("SIGTERM");
  }
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
