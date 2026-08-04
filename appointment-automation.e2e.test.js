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

async function login(base, email, password, identityField) {
  const body = { password };
  body[identityField || "email"] = email;
  const response = await fetch(base + "/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify(body)
  });
  assert.strictEqual(response.status, 200);
  return String(response.headers.get("set-cookie") || "").split(";")[0];
}

function appointmentAnswers() {
  return {
    setup_goal: "appointments",
    business: {
      brand_name: "Appointment Auto",
      contact_email: "admin@appointment-auto.example",
      contact_phone: "+57 300 100 2000"
    },
    meta: {
      whatsapp_number: "+57 300 100 2000",
      whatsapp_integration_intent: "no"
    },
    operations: {
      primary_country: "Colombia",
      primary_city: "Bogotá",
      monthly_customer_volume: "200",
      support_hours: "Lunes a viernes de 8 a 5"
    },
    team: {
      admin_email: "admin@appointment-auto.example",
      human_support_contact: "Recepción"
    },
    channels: { phone_calls: true },
    appointment_setup: {
      business_name: "Appointment Auto",
      business_category: "salud_bienestar",
      target_customer: "Pacientes que necesitan reservar una consulta",
      business_description: "Centro de atención con agenda presencial y virtual.",
      assistant_tone: "calido_empatico",
      bot_display_name: "Luciana",
      allowed_topics: "Servicios, horarios, disponibilidad y citas",
      forbidden_topics: "Diagnósticos y promesas médicas",
      escalation_triggers: "Urgencias, quejas y solicitudes fuera de alcance",
      escalation_contact: "Recepción +57 300 100 2000",
      services: "Consulta inicial y control",
      business_hours: "Lunes a viernes de 8 a 5",
      staff_mode: "multiple",
      appointment_locations: "Sede principal y virtual",
      availability_rules: "Usar únicamente espacios libres de Google Calendar",
      required_booking_fields: "Nombre, teléfono, servicio y horario",
      booking_confirmation_mode: "automatic",
      cancellation_policy: "Avisar con al menos 12 horas",
      calendar_provider: "google",
      calendar_email: "agenda@appointment-auto.example",
      reminder_channel: "email",
      reminder_timing: "both",
      survey_enabled: "yes",
      appointment_whatsapp_enabled: false,
      data_consent: true
    }
  };
}

(async function run() {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const customerPassword = "AppointmentCustomer2026";
  const ownerPassword = "AppointmentOwner2026";
  const tenantId = "appointment-auto";
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      DEFAULT_TENANT_ID: tenantId,
      TENANT_BRAND_NAME: "Appointment Auto",
      DASHBOARD_KEY: "appointment-automation-key",
      DASHBOARD_SESSION_SECRET: "appointment-automation-session-secret",
      DASHBOARD_USERS: JSON.stringify([{
        username: "owner",
        email: "owner@nextforia.example",
        password: ownerPassword,
        name: "Platform Owner",
        role: "super_admin"
      }]),
      VERIFY_TOKEN: "appointment-automation-verify",
      WA_TOKEN: "appointment-automation-wa-token",
      PHONE_NUMBER_ID: "meta-phone-appointment-auto",
      TENANT_DISPLAY_PHONE: "+57 300 100 2000",
      ANTHROPIC_API_KEY: "appointment-automation-anthropic",
      DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64url"),
      CUSTOMER_ACCESS_V2_ENABLED: "1",
      CUSTOMER_ACCESS_TEST_MODE: "1",
      CUSTOMER_ACCESS_TEST_USERS: JSON.stringify([{
        user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        tenant_id: tenantId,
        company_name: "Appointment Auto",
        email: "admin@appointment-auto.example",
        password: customerPassword,
        role: "admin",
        plan_id: "nextfor-tempo",
        assigned_bot_id: "agendamiento",
        setup_completed: false
      }]),
      CUSTOMER_PANEL_BASE_URL: "https://nextforia.com",
      PAYMENTS_V1_ENABLED: "0",
      APPOINTMENT_SETUP_ENABLED: "1",
      APPOINTMENT_SETUP_TENANT_IDS: "*",
      APPOINTMENT_STORAGE_TEST_READY: "1",
      APPOINTMENT_CALENDAR_TENANT_MAP: JSON.stringify({
        [tenantId]: {
          provider: "google",
          status: "connected",
          calendar_email: "agenda@appointment-auto.example",
          calendar_id: "primary"
        }
      }),
      GOOGLE_CALENDAR_CLIENT_ID: "appointment-google-client",
      GOOGLE_CALENDAR_CLIENT_SECRET: "appointment-google-secret",
      CHANNEL_CONNECTIONS_V1_ENABLED: "1",
      CHANNEL_CONNECTIONS_TEST_MODE: "1",
      META_APP_ID: "appointment-meta-app",
      META_APP_SECRET: "appointment-meta-secret",
      META_WHATSAPP_CONFIG_ID: "appointment-whatsapp-config",
      ELEVENLABS_API_KEY: "appointment-elevenlabs-api-key",
      ELEVENLABS_WEBHOOK_SECRET: "appointment-elevenlabs-webhook-secret",
      ELEVENLABS_APPOINTMENT_TEMPLATE_AGENT_ID: "luciana-template-agent",
      ELEVENLABS_APPOINTMENT_TOOL_SECRET: "appointment-tool-secret-longer-than-thirty-two-characters",
      ELEVENLABS_APPOINTMENT_TOOL_BASE_URL: "https://api.nextforia.com",
      ELEVENLABS_APPOINTMENT_AGENT_WRITE_ENABLED: "1",
      ELEVENLABS_APPOINTMENT_AGENT_TEST_MODE: "1",
      ELEVENLABS_PHONE_NUMBER_TENANT_MAP: "{}",
      ELEVENLABS_PHONE_AUTO_ASSIGN_ENABLED: "1",
      SUPABASE_URL: "",
      SUPABASE_KEY: ""
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);
    const customerCookie = await login(base, "admin@appointment-auto.example", customerPassword);
    const ownerCookie = await login(base, "owner@nextforia.example", ownerPassword, "username");

    let response = await fetch(base + "/admin/client-onboarding/data", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: base, cookie: customerCookie },
      body: JSON.stringify({
        status: "completed",
        plan_id: "nextfor-tempo",
        bot_id: "agendamiento",
        answers: appointmentAnswers()
      })
    });
    let body = await response.json();
    assert.strictEqual(response.status, 200, JSON.stringify(body));
    assert.strictEqual(body.onboarding.completion, 100);
    assert.match(body.redirect, /tab=appointments/);

    response = await fetch(base + "/admin/customer-setups/" + tenantId, {
      headers: { cookie: ownerCookie }
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.strictEqual(body.review.status, "ready");
    assert.strictEqual(body.onboarding.appointment_configuration.lifecycle, "draft");
    assert(body.review.history.some(function (event) {
      return event.action === "auto_build_configuration";
    }));
    assert.strictEqual(body.launch.ready, false);
    assert.strictEqual(body.launch.automation_ready, true);
    assert(body.launch.automatic_blockers.some(function (item) {
      return item.code === "appointment_elevenlabs_agent_not_mapped";
    }));
    assert.deepStrictEqual(body.launch.external_blockers, []);

    response = await fetch(base + "/admin/customer-setups/" + tenantId, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: base, cookie: ownerCookie },
      body: JSON.stringify({
        action: "launch_live",
        launch_confirmed: true,
        review_note: "Aprobación automática E2E"
      })
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.strictEqual(body.review.status, "live");
    assert.strictEqual(body.launch.ready, true);
    assert.strictEqual(body.onboarding.answers.appointment_setup.setup_status, "active");
    assert.strictEqual(body.onboarding.customer_service_configuration, null);
    assert.strictEqual(body.onboarding.appointment_configuration.lifecycle, "approved_for_testing");
    assert.strictEqual(body.onboarding.appointment_configuration.external_status, "configured");
    assert.strictEqual(body.onboarding.appointment_configuration.external_agent_id, "agent_test_created");
    assert.strictEqual(body.onboarding.appointment_configuration.external_phone_status, "configured");
    assert.strictEqual(
      body.onboarding.appointment_configuration.external_phone_number_id,
      "phone_test_available"
    );
    assert.strictEqual(
      body.onboarding.appointment_configuration.external_phone_number,
      "+15550001111"
    );
    const actions = body.review.history.map(function (event) { return event.action; });
    assert(actions.includes("build_configuration"));
    assert(actions.includes("approve_configuration"));
    assert(actions.includes("configure_appointment_agent"));
    assert.strictEqual(actions[actions.length - 1], "launch_live");
    assert(body.review.history.some(function (event) { return event.status === "building"; }));
    assert(body.review.history.some(function (event) { return event.status === "testing"; }));

    response = await fetch(base + "/admin/customer-setups/" + tenantId, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: base, cookie: ownerCookie },
      body: JSON.stringify({ action: "launch_live", launch_confirmed: true })
    });
    assert.strictEqual(response.status, 200);
    const repeated = await response.json();
    assert.strictEqual(repeated.onboarding.appointment_configuration.external_agent_id, "agent_test_created");
    assert.strictEqual(repeated.review.history.length, body.review.history.length);

    console.log("appointment automation e2e tests: ok");
  } finally {
    child.kill("SIGTERM");
  }
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
