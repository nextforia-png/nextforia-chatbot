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
      if (process.env.CUSTOMER_ACCESS_TEST_DEBUG === "1") process.stderr.write(String(chunk || ""));
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

async function login(base, body, expectedStatus) {
  const response = await fetch(base + "/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify(body)
  });
  assert.strictEqual(response.status, expectedStatus || 200);
  return {
    body: await response.json(),
    cookie: String(response.headers.get("set-cookie") || "").split(";")[0]
  };
}

function signedSessionCookie(secret, user) {
  const payload = Buffer.from(JSON.stringify({
    v: 2,
    rst: "customer-access-ready-clean-2026-07-28",
    uid: user.user_id,
    e: user.email,
    n: user.email,
    r: "admin",
    t: user.tenant_id,
    exp: Date.now() + 60 * 60 * 1000
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return "rav_dashboard_session=" + encodeURIComponent(payload + "." + signature);
}

(async function run() {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const sessionSecret = "customer-panel-v2-session-secret";
  const validInviteToken = "V".repeat(43);
  const expiredInviteToken = "E".repeat(43);
  const revokedInviteToken = "R".repeat(43);
  const usedInviteToken = "U".repeat(43);
  const fixturePassword = "TenantPassword2026";
  const fixtureSalt = "BwcHBwcHBwcHBwcHBwcHBw";
  const fixtureHash = "vI4zYyHL91qWraHNLobM1UGoSLRKOz1_YcbXI30oWkRTA9nROmpb5PpP-S4bUfx9E6A5bIMHzvbVVehS_nubIw";
  const fixtures = [
    { user_id: "11111111-1111-4111-8111-111111111111", tenant_id: "tenant-a", company_name: "Empresa A", email: "admin@a.example", password: fixturePassword, password_salt: fixtureSalt, password_hash: fixtureHash, role: "admin", plan_id: "nextfor-aura", assigned_bot_id: "atencion-cliente" },
    { user_id: "22222222-2222-4222-8222-222222222222", tenant_id: "tenant-b", company_name: "Empresa B", email: "admin@b.example", password: fixturePassword, password_salt: fixtureSalt, password_hash: fixtureHash, role: "admin", plan_id: "nextfor-uno", assigned_bot_id: "atencion-cliente" },
    { user_id: "33333333-3333-4333-8333-333333333333", tenant_id: "tenant-disabled", company_name: "Empresa Disabled", email: "disabled@example.com", password: fixturePassword, password_salt: fixtureSalt, password_hash: fixtureHash, role: "admin", active: false },
    { user_id: "44444444-4444-4444-8444-444444444444", tenant_id: "tenant-before-reset", company_name: "Empresa Vieja", email: "ventas@ravtoys.com", password: fixturePassword, password_salt: fixtureSalt, password_hash: fixtureHash, role: "admin", created_at: "2026-07-28T01:00:00.000Z" }
  ];
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      DASHBOARD_KEY: "customer-panel-v2-key",
      DASHBOARD_SESSION_SECRET: sessionSecret,
      DASHBOARD_USERS: "[]",
      VERIFY_TOKEN: "customer-panel-v2-verify",
      WA_TOKEN: "customer-panel-v2-wa-dummy",
      ANTHROPIC_API_KEY: "customer-panel-v2-anthropic-dummy",
      SUPABASE_URL: "",
      SUPABASE_KEY: "",
      CUSTOMER_ACCESS_V2_ENABLED: "1",
      CUSTOMER_PUBLIC_SIGNUP_ENABLED: "1",
      CUSTOMER_ACCESS_RESET_CUTOFF: "2026-07-28T01:00:00.000Z",
      CUSTOMER_ACCESS_TEST_MODE: "1",
      CUSTOMER_ACCESS_TEST_FORCE_SCHEMA_UNAVAILABLE: "1",
      CUSTOMER_ACCESS_TEST_USERS: JSON.stringify(fixtures),
      CUSTOMER_ACCESS_TEST_INVITATIONS: JSON.stringify([
        { tenant_id: "setup-tenant", company_name: "Empresa Setup", email: "invited@example.com", token: validInviteToken },
        { tenant_id: "expired-tenant", company_name: "Empresa Expired", email: "expired@example.com", token: expiredInviteToken, expires_at: "2020-01-01T00:00:00.000Z" },
        { tenant_id: "revoked-tenant", company_name: "Empresa Revoked", email: "revoked@example.com", token: revokedInviteToken, revoked_at: "2026-07-21T12:00:00.000Z" },
        { tenant_id: "used-tenant", company_name: "Empresa Used", email: "used@example.com", token: usedInviteToken, used_at: "2026-07-21T12:00:00.000Z" }
      ]),
      CUSTOMER_PANEL_BASE_URL: "https://customer-panel.staging.example"
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);
    let response = await fetch(base + "/admin/create-account?business=Cl%C3%ADnica%20Demo");
    assert.strictEqual(response.status, 200);
    const publicSignupHtml = await response.text();
    assert(publicSignupHtml.includes("Crea tu cuenta"));
    assert(publicSignupHtml.includes("Clínica Demo"));
    assert(publicSignupHtml.includes("/admin/create-account"));
    assert(!publicSignupHtml.includes('id="username"'));
    assert(!publicSignupHtml.includes('id="bot"'), "public account creation must not ask for bot type");
    assert(!publicSignupHtml.includes('id="plan"'), "public account creation must not ask for plan");
    assert(publicSignupHtml.includes('id="contactPhone"'));
    assert(publicSignupHtml.includes("Tu teléfono o WhatsApp"));
    assert(publicSignupHtml.includes("El WhatsApp del negocio lo configuramos después."));
    assert(publicSignupHtml.includes("Estoy listo para que me entrenes"));
    assert(publicSignupHtml.includes("/admin/assets/lumen-entrenando.png"));

    response = await fetch(base + "/admin/client-onboarding-demo");
    assert.strictEqual(response.status, 200);
    const demoAccountHtml = await response.text();
    assert(demoAccountHtml.includes("Crea tu cuenta"));
    assert(demoAccountHtml.includes("Modo demo"));
    assert(demoAccountHtml.includes("/admin/client-onboarding-demo?step=setup"));
    assert(!demoAccountHtml.includes("Enséñale a Nextfor lo esencial de tu negocio"), "demo starts with account creation, not questionnaire");

    response = await fetch(base + "/admin/client-onboarding-demo?step=setup");
    assert.strictEqual(response.status, 200);
    const demoSetupHtml = await response.text();
    assert(demoSetupHtml.includes("Comenzar el entrenamiento"));
    assert(demoSetupHtml.includes("Enséñale a Nextfor lo esencial de tu negocio"));

    response = await fetch(base + "/admin/create-account", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({
        company_name: "Empresa Pública",
        admin_email: "publica@example.com",
        contact_phone: "+57 311 222 3333",
        password: "PublicPassword2026",
        password_confirmation: "PublicPassword2026"
      })
    });
    assert.strictEqual(response.status, 201);
    const publicSignup = await response.json();
    assert.strictEqual(publicSignup.user.email, "publica@example.com");
    assert.strictEqual(publicSignup.tenant.plan_id, "nextfor-uno");
    assert.strictEqual(publicSignup.tenant.assigned_bot_id, "atencion-cliente");
    assert.strictEqual(publicSignup.lead.contact_phone, "+57 311 222 3333");
    assert.strictEqual(publicSignup.lead.onboarding_draft_saved, true);
    assert.strictEqual(publicSignup.redirect, "/admin/client-onboarding");
    const publicCookie = String(response.headers.get("set-cookie") || "").split(";")[0];
    assert.match(publicCookie, /^rav_dashboard_session=/);

    response = await fetch(base + "/admin/client-onboarding/data", {
      headers: { cookie: publicCookie }
    });
    assert.strictEqual(response.status, 200);
    const publicOnboarding = await response.json();
    assert.strictEqual(publicOnboarding.onboarding.answers.business.contact_email, "publica@example.com");
    assert.strictEqual(publicOnboarding.onboarding.answers.business.contact_phone, "+57 311 222 3333");
    assert.strictEqual(publicOnboarding.onboarding.answers.meta.whatsapp_number, "+57 311 222 3333");

    response = await fetch(base + "/admin/customer-setup-questionnaire", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-dashboard-key": "customer-panel-v2-key" },
      body: JSON.stringify({
        questions: [{
          id: "custom_objetivo_retencion",
          label: "¿Qué información nueva debe aprender Nextfor para mejorar la retención?",
          section: "business",
          order: 86,
          type: "textarea",
          required: true,
          active: true
        }]
      })
    });
    assert.strictEqual(response.status, 200);
    const questionnaireUpdate = await response.json();
    assert(questionnaireUpdate.questionnaire.questions.some(function (question) {
      return question.path === "custom.objetivo_retencion";
    }));

    response = await fetch(base + "/admin/client-onboarding/data", {
      headers: { cookie: publicCookie }
    });
    assert.strictEqual(response.status, 200);
    const publicOnboardingWithQuestion = await response.json();
    assert(publicOnboardingWithQuestion.questionnaire.questions.some(function (question) {
      return question.label === "¿Qué información nueva debe aprender Nextfor para mejorar la retención?";
    }));
    assert(publicOnboardingWithQuestion.pending_questions.some(function (question) {
      return question.path === "custom.objetivo_retencion";
    }), "new Super Admin questions must surface as pending setup information");

    response = await fetch(base + "/admin/leads", {
      headers: { "x-dashboard-key": "customer-panel-v2-key" }
    });
    assert.strictEqual(response.status, 200);
    const publicLeadPipeline = await response.json();
    const publicLead = publicLeadPipeline.leads.rows.find(function (row) {
      return row.tenant_id === publicSignup.tenant.id;
    });
    assert(publicLead, "compatibility accounts must appear in Super Admin leads");
    assert.strictEqual(publicLead.admin_email, "publica@example.com");
    assert.strictEqual(publicLead.contact_phone, "+57 311 222 3333");

    response = await fetch(base + "/admin/customer-setups", {
      headers: { "x-dashboard-key": "customer-panel-v2-key" }
    });
    assert.strictEqual(response.status, 200);
    const setupReview = await response.json();
    assert(setupReview.setups.some(function (entry) {
      return entry.tenant_id === publicSignup.tenant.id
        && entry.tenant.admin_email === "publica@example.com";
    }), "compatibility accounts must appear in Super Admin setup review");

    const publicLogin = await login(base, { email: "publica@example.com", password: "PublicPassword2026" });
    assert.strictEqual(publicLogin.body.redirect, "/admin/client-onboarding");
    assert.strictEqual(publicLogin.body.user.tenant_id, publicSignup.tenant.id);

    response = await fetch(base + "/admin/create-account", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({
        company_name: "Empresa Pública Duplicada",
        admin_email: "publica@example.com",
        contact_phone: "+57 311 222 3333",
        password: "PublicPassword2026",
        password_confirmation: "PublicPassword2026"
      })
    });
    assert.strictEqual(response.status, 409);
    assert.strictEqual((await response.json()).error, "customer_already_exists");

    response = await fetch(base + "/admin/create-account", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({
        company_name: "Empresa Vieja",
        admin_email: "ventas@ravtoys.com",
        contact_phone: "+57 300 444 5555",
        password: "ResetPassword2026",
        password_confirmation: "ResetPassword2026"
      })
    });
    assert.strictEqual(response.status, 201, "a pre-reset email/company can start over from zero");
    const resetSignup = await response.json();
    assert.strictEqual(resetSignup.user.email, "ventas@ravtoys.com");
    assert.strictEqual(resetSignup.tenant.company_name, "Empresa Vieja");
    const resetLogin = await login(base, { email: "ventas@ravtoys.com", password: "ResetPassword2026" });
    assert.strictEqual(resetLogin.body.user.tenant_id, resetSignup.tenant.id);

    response = await fetch(base + "/admin/setup/setup-tenant?invite=" + validInviteToken);
    assert.strictEqual(response.status, 200);
    const setupHtml = await response.text();
    assert(setupHtml.includes("invited@example.com"));
    assert(setupHtml.includes("readonly"));
    assert(!setupHtml.includes('id="username"'));

    response = await fetch(base + "/admin/setup/otro-tenant?invite=" + validInviteToken);
    assert.strictEqual(response.status, 403);
    response = await fetch(base + "/admin/setup/expired-tenant?invite=" + expiredInviteToken);
    assert.strictEqual(response.status, 410);
    response = await fetch(base + "/admin/setup/expired-tenant", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ invite: expiredInviteToken, password: "SetupPassword2026", password_confirmation: "SetupPassword2026" })
    });
    assert.strictEqual(response.status, 410);
    assert.strictEqual((await response.json()).error, "invitation_expired");
    response = await fetch(base + "/admin/setup/revoked-tenant?invite=" + revokedInviteToken);
    assert.strictEqual(response.status, 409);
    response = await fetch(base + "/admin/setup/used-tenant?invite=" + usedInviteToken);
    assert.strictEqual(response.status, 409);

    response = await fetch(base + "/admin/setup/setup-tenant", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ invite: validInviteToken, password: "SetupPassword2026", password_confirmation: "DifferentPassword2026" })
    });
    assert.strictEqual(response.status, 400);
    assert.strictEqual((await response.json()).error, "password_mismatch");

    response = await fetch(base + "/admin/setup/setup-tenant", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ invite: validInviteToken, password: "SetupPassword2026", password_confirmation: "SetupPassword2026" })
    });
    assert.strictEqual(response.status, 201);
    const activated = await response.json();
    assert.strictEqual(activated.user.email, "invited@example.com");
    assert.strictEqual(activated.user.tenant_id, "setup-tenant");
    assert.strictEqual(activated.redirect, "/admin/client-onboarding");

    response = await fetch(base + "/admin/setup/setup-tenant", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ invite: validInviteToken, password: "SetupPassword2026", password_confirmation: "SetupPassword2026" })
    });
    assert.strictEqual(response.status, 200);
    const existingAccess = await response.json();
    assert.strictEqual(existingAccess.existing_access, true);
    assert.strictEqual(existingAccess.user.email, "invited@example.com");
    assert.strictEqual(existingAccess.user.tenant_id, "setup-tenant");
    assert.strictEqual(existingAccess.redirect, "/admin/client-onboarding");

    response = await fetch(base + "/admin/setup/setup-tenant", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ invite: validInviteToken, password: "WrongPassword2026", password_confirmation: "WrongPassword2026" })
    });
    assert.strictEqual(response.status, 401);
    assert.strictEqual((await response.json()).error, "invalid_credentials");

    const activatedLogin = await login(base, { email: "invited@example.com", password: "SetupPassword2026" });
    assert.strictEqual(activatedLogin.body.user.tenant_id, "setup-tenant");
    assert.strictEqual(activatedLogin.body.redirect, "/admin/client-onboarding");

    const userA = await login(base, { email: "ADMIN@A.EXAMPLE", password: fixturePassword });
    const userB = await login(base, { email: "admin@b.example", password: fixturePassword });
    assert.strictEqual(userA.body.user.tenant_id, "tenant-a");
    assert.strictEqual(userB.body.user.tenant_id, "tenant-b");
    assert.match(userA.cookie, /^rav_dashboard_session=/);

    response = await fetch(base + "/admin/panel?tab=appointments", { headers: { cookie: userA.cookie } });
    assert.strictEqual(response.status, 200);
    const shellA = await response.text();
    assert(shellA.includes("<title>Nextfor IA · Empresa A</title>"));
    assert(shellA.includes('<h1><span id="brandBusinessName">Empresa A</span></h1><p>con <span>Nextfor IA</span></p>'));
    assert(shellA.includes("Plan Nextfor Aura"));
    assert(shellA.includes('id="bot-support"'));
    assert(!shellA.includes('id="bot-appointments"'), "tenant A must not receive the unassigned appointments bot switch");
    assert(!shellA.includes('id="navAppointments"'), "tenant A must not receive appointments navigation");
    assert(!shellA.includes('id="panel-appointments"'), "tenant A must not receive appointments panel markup");
    assert(shellA.includes("1 bot activo"));
    assert(shellA.includes('id="nav-logout"'));
    assert(shellA.includes('id="nav-notifications"'));
    assert(shellA.includes('id="panel-notifications"'));
    assert(shellA.includes("Cerrar Sesión"));
    assert(!shellA.includes(">RAV Toys<"));
    assert(!shellA.includes(">Empresa B<"));

    response = await fetch(base + "/admin/client-onboarding?edit=1&focus=pending&return_to=%2Fadmin%2Fpanel%3Ftab%3Dnotifications", {
      headers: { cookie: userA.cookie }
    });
    assert.strictEqual(response.status, 200);
    const onboardingEditA = await response.text();
    assert(onboardingEditA.includes('class="returnLink" href="/admin/panel?tab=notifications"'));
    assert(onboardingEditA.includes("← Volver al Panel de Control"));
    assert(!onboardingEditA.includes("Empresa B"));

    response = await fetch(base + "/admin/logout", {
      method: "POST",
      headers: { origin: base, cookie: userA.cookie }
    });
    assert.strictEqual(response.status, 200);
    assert.match(String(response.headers.get("set-cookie") || ""), /Max-Age=0/);

    response = await fetch(base + "/admin/panel?tab=summary", { headers: { cookie: userB.cookie } });
    assert.strictEqual(response.status, 200);
    const shellB = await response.text();
    assert(shellB.includes("<title>Nextfor IA · Empresa B</title>"));
    assert(shellB.includes('<h1><span id="brandBusinessName">Empresa B</span></h1><p>con <span>Nextfor IA</span></p>'));
    assert(shellB.includes("Plan Nextfor Uno"));
    assert(!shellB.includes('id="bot-appointments"'));
    assert(!shellB.includes('id="navAppointments"'));
    assert(!shellB.includes('id="panel-appointments"'));
    assert(shellB.includes('id="bot-support"'), "tenant B must receive the assigned support bot switch");
    assert(shellB.includes("1 bot activo"));
    assert(shellB.includes('INITIAL_TAB="summary"'), "chatbot-only tenants must open summary");
    assert(!shellB.includes(">RAV Toys<"));
    assert(!shellB.includes(">Empresa A<"));

    response = await fetch(base + "/admin/panel/appointments-data?tenant_id=tenant-a", { headers: { cookie: userB.cookie } });
    assert.strictEqual(response.status, 403);
    const appointmentsB = await response.json();
    assert.strictEqual(appointmentsB.error, "module_not_contracted");

    const usernameAttempt = await login(base, { username: "admin@a.example", password: fixturePassword }, 401);
    assert.strictEqual(usernameAttempt.body.error, "invalid_credentials", "v2 customer login requires the email field");

    response = await fetch(base + "/admin/panel/data?tenant_id=tenant-b", { headers: { cookie: userA.cookie } });
    assert.strictEqual(response.status, 200);
    const panelA = await response.json();
    assert.strictEqual(panelA.business.id, "tenant-a");
    assert.strictEqual(panelA.business.name, "Empresa A");
    assert.strictEqual(panelA.business.plan_id, "nextfor-aura");
    assert.strictEqual(panelA.business.assigned_bot_id, "atencion-cliente");
    assert.strictEqual(panelA.data_window.source, "tenant_isolated");
    assert(panelA.nextfor_notifications.pending_questions.some(function (question) {
      return question.path === "custom.objetivo_retencion";
    }), "returning tenant A must see new setup questions as Nextfor notifications");
    assert(!JSON.stringify(panelA).includes("Empresa B"));

    response = await fetch(base + "/admin/panel/data?tenant_id=tenant-a", { headers: { cookie: userB.cookie } });
    assert.strictEqual(response.status, 200);
    const panelB = await response.json();
    assert.strictEqual(panelB.business.id, "tenant-b");
    assert.strictEqual(panelB.business.name, "Empresa B");
    assert.strictEqual(panelB.business.plan_id, "nextfor-uno");
    assert.strictEqual(panelB.business.assigned_bot_id, "atencion-cliente");
    assert(!JSON.stringify(panelB).includes("Empresa A"));

    response = await fetch(base + "/admin/client-onboarding/data?tenant_id=tenant-b", { headers: { cookie: userA.cookie } });
    assert.strictEqual(response.status, 200);
    const onboardingA = await response.json();
    assert.strictEqual(onboardingA.tenant.id, "tenant-a");
    onboardingA.onboarding.answers.business.contact_name = "Contacto exclusivo A";

    response = await fetch(base + "/admin/client-onboarding/data?tenant_id=tenant-b", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: base, cookie: userA.cookie },
      body: JSON.stringify({ tenant_id: "tenant-b", status: "draft", answers: onboardingA.onboarding.answers })
    });
    assert.strictEqual(response.status, 200);
    const savedA = await response.json();
    assert.strictEqual(savedA.onboarding.tenant_id, "tenant-a", "body/query cannot replace the signed tenant");

    response = await fetch(base + "/admin/client-onboarding/data", { headers: { cookie: userB.cookie } });
    assert.strictEqual(response.status, 200);
    const onboardingB = await response.json();
    assert.strictEqual(onboardingB.tenant.id, "tenant-b");
    assert.notStrictEqual(onboardingB.onboarding.answers.business.contact_name, "Contacto exclusivo A");

    response = await fetch(base + "/admin/client-onboarding/data", { headers: { cookie: userA.cookie } });
    assert.strictEqual((await response.json()).onboarding.answers.business.contact_name, "Contacto exclusivo A");

    const cookieValue = decodeURIComponent(userA.cookie.split("=").slice(1).join("="));
    const tokenParts = cookieValue.split(".");
    const forgedPayload = JSON.parse(Buffer.from(tokenParts[0], "base64url").toString("utf8"));
    forgedPayload.t = "tenant-b";
    const forgedCookie = "rav_dashboard_session=" + encodeURIComponent(Buffer.from(JSON.stringify(forgedPayload)).toString("base64url") + "." + tokenParts[1]);
    response = await fetch(base + "/admin/session", { headers: { cookie: forgedCookie } });
    assert.strictEqual(response.status, 401, "tampering with the signed tenant invalidates the session");

    const disabledCookie = signedSessionCookie(sessionSecret, fixtures[2]);
    response = await fetch(base + "/admin/session", { headers: { cookie: disabledCookie } });
    assert.strictEqual(response.status, 401, "an inactive membership invalidates an otherwise correctly signed session");

    const oldLogin = await login(base, { email: "ventas@ravtoys.com", password: fixturePassword }, 401);
    assert.strictEqual(oldLogin.body.error, "invalid_credentials", "pre-reset customer users cannot login after the clean slate");
    const oldCookie = signedSessionCookie(sessionSecret, { user_id: fixtures[3].user_id, email: fixtures[3].email, tenant_id: fixtures[3].tenant_id });
    response = await fetch(base + "/admin/session", { headers: { cookie: oldCookie } });
    assert.strictEqual(response.status, 401, "a correctly signed pre-reset session is invalidated by membership age");
    assert.match(String(response.headers.get("set-cookie") || ""), /Max-Age=0/);

    for (const route of ["/signup", "/register", "/admin/signup", "/admin/register"]) {
      response = await fetch(base + route, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: "{}" });
      assert.strictEqual(response.status, 404);
    }

    console.log("customer-panel-access-v2.e2e.test.js: ok");
  } finally {
    child.kill("SIGTERM");
  }
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
