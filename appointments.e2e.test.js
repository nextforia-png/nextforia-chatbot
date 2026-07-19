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

function elevenLabsSignature(body, secret, timestamp) {
  return "t=" + timestamp + ",v0=" + crypto.createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");
}

(async function run() {
  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const dashboardKey = "appointments-e2e-dashboard-key";
  const webhookSecret = "appointments-e2e-webhook-secret";
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      DASHBOARD_KEY: dashboardKey,
      DASHBOARD_SESSION_SECRET: "appointments-e2e-session-secret",
      DASHBOARD_USERS: JSON.stringify([
        { username: "derco-admin", password: "derco-test-password", role: "admin", tenant_id: "grupo-derco", name: "Admin DERCO" },
        { username: "other-admin", password: "other-test-password", role: "admin", tenant_id: "otro-cliente", name: "Otro Admin" }
      ]),
      VERIFY_TOKEN: "appointments-e2e-verify-token",
      WA_TOKEN: "appointments-e2e-not-used",
      ANTHROPIC_API_KEY: "appointments-e2e-not-used",
      ELEVENLABS_WEBHOOK_SECRET: webhookSecret,
      ELEVENLABS_AGENT_TENANT_MAP: JSON.stringify({ agent_derco: "grupo-derco" }),
      SUPABASE_URL: "",
      SUPABASE_KEY: ""
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      type: "post_call_transcription",
      event_timestamp: timestamp,
      data: {
        agent_id: "agent_derco",
        conversation_id: "conv_e2e_001",
        analysis: {
          transcript_summary: "Cita confirmada",
          data_collection_results: {
            appointment_status: { value: "booked" },
            appointment_datetime: { value: "2030-07-21T09:00:00-05:00" },
            client_name: { value: "Cliente Prueba" },
            consultation_reason: { value: "Consulta piloto" },
            data_processing_consent: { value: "authorized" }
          }
        }
      }
    });

    let response = await fetch(base + "/webhooks/elevenlabs/post-call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    });
    assert.strictEqual(response.status, 401, "unsigned ElevenLabs webhooks must fail closed");

    const signature = elevenLabsSignature(body, webhookSecret, timestamp);
    response = await fetch(base + "/webhooks/elevenlabs/post-call", {
      method: "POST",
      headers: { "content-type": "application/json", "elevenlabs-signature": signature },
      body
    });
    assert.strictEqual(response.status, 200);

    response = await fetch(base + "/webhooks/elevenlabs/post-call", {
      method: "POST",
      headers: { "content-type": "application/json", "elevenlabs-signature": signature },
      body
    });
    assert.strictEqual(response.status, 200, "webhook retries should upsert safely");

    response = await fetch(base + "/admin/pilots/derco/data", { headers: { "x-dashboard-key": dashboardKey } });
    assert.strictEqual(response.status, 200);
    const data = await response.json();
    assert.strictEqual(data.business.customer_number, 1);
    assert.strictEqual(data.metrics.interactions, 1);
    assert.strictEqual(data.metrics.booked, 1);
    assert.strictEqual(data.upcoming.length, 1);

    response = await fetch(base + "/admin/pilots/derco", { headers: { "x-dashboard-key": dashboardKey } });
    assert.strictEqual(response.status, 200);
    assert((await response.text()).includes("Grupo Jurídico DERCO S.A.S."));

    response = await fetch(base + "/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ username: "derco-admin", password: "derco-test-password" })
    });
    assert.strictEqual(response.status, 200);
    const dercoCookie = String(response.headers.get("set-cookie") || "").split(";")[0];
    response = await fetch(base + "/admin/pilots/derco/data", { headers: { cookie: dercoCookie } });
    assert.strictEqual(response.status, 200, "DERCO user should access only its tenant panel");

    response = await fetch(base + "/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ username: "other-admin", password: "other-test-password" })
    });
    assert.strictEqual(response.status, 200);
    const otherCookie = String(response.headers.get("set-cookie") || "").split(";")[0];
    response = await fetch(base + "/admin/pilots/derco/data", { headers: { cookie: otherCookie } });
    assert.strictEqual(response.status, 401, "another tenant must not access DERCO data");
    response = await fetch(base + "/admin/panel/data", { headers: { cookie: otherCookie } });
    assert.strictEqual(response.status, 401, "another tenant must not access the default tenant data");
    response = await fetch(base + "/admin/panel", { headers: { cookie: otherCookie } });
    assert.strictEqual(response.status, 403, "another tenant must not access the default tenant panel");

    console.log("appointments e2e tests: ok");
  } finally {
    child.kill("SIGTERM");
  }
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
