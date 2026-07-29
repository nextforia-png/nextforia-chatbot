"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
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
        resolve(output);
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

(async function run() {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const bootstrapStart = source.indexOf("async function bootstrapExistingWhatsAppConnection()");
  const bootstrapEnd = source.indexOf("channelConnectionBootstrapPromise = bootstrapExistingWhatsAppConnection();");
  assert(bootstrapStart >= 0 && bootstrapEnd > bootstrapStart);
  const bootstrapSource = source.slice(bootstrapStart, bootstrapEnd);
  assert.match(bootstrapSource, /access_token:\s*WA_TOKEN,[\s\S]*?coexistence:\s*true/);
  assert.match(source, /function instagramGraphOriginForRuntime\(runtime\)[\s\S]*?runtime\.source === "channel_connection"[\s\S]*?"https:\/\/graph\.facebook\.com"/);
  assert.match(source, /const graphOrigin = instagramGraphOriginForRuntime\(runtime\);[\s\S]*?`\$\{graphOrigin\}\/\$\{META_GRAPH_VERSION\}\/\$\{sendId\}\/messages`/);
  assert.match(source, /instagramRuntimeState\.last_error_code = metaError\.code \|\| null/);
  assert.match(source, /instagramRuntimeState\.last_error_subcode = metaError\.error_subcode \|\| null/);
  assert.match(source, /instagramRuntimeState\.last_error_type = metaError\.type \|\| err\.code \|\| null/);
  assert.match(source, /const ravAliasTenant = cleanTenantId\(CHANNEL_CONNECTION_BOOTSTRAP_WHATSAPP_TENANT_ID\)/);
  assert.match(source, /if \(alias && alias\.source === "channel_connection"\) return alias/);

  const port = await availablePort();
  const base = "http://127.0.0.1:" + port;
  const encryptionKey = crypto.randomBytes(32).toString("base64url");
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "production",
      DASHBOARD_KEY: "channel-production-dashboard-key-2026",
      DASHBOARD_SESSION_SECRET: "channel-production-session-secret-2026",
      DASHBOARD_USERS: JSON.stringify([
        { username: "owner", email: "owner@nextforia.test", password: "OwnerPassword2026", role: "super_admin", name: "Owner" }
      ]),
      VERIFY_TOKEN: "channel-production-verify",
      WA_TOKEN: "channel-production-wa-legacy",
      PHONE_NUMBER_ID: "rav-phone-id",
      PUBLIC_BASE_URL: "https://rav-whatsapp-bot.onrender.com",
      CUSTOMER_PANEL_BASE_URL: "https://rav-whatsapp-bot.onrender.com",
      ANTHROPIC_API_KEY: "channel-production-anthropic",
      DATA_ENCRYPTION_KEY: encryptionKey,
      CHANNEL_CONNECTIONS_V1_ENABLED: "1",
      SUPABASE_URL: "https://nextforia-test.supabase.co",
      SUPABASE_KEY: "channel-production-supabase-key"
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);

    let response = await fetch(base + "/");
    assert.strictEqual(response.status, 200);
    assert((await response.text()).includes("v259-channel-tenant-runtime-routing"));

    response = await fetch(base + "/admin/panel/channel-connections");
    assert.strictEqual(response.status, 401, "real channel endpoint must be enabled, not demo-only");

    response = await fetch(base + "/whatsapp/health");
    assert.strictEqual(response.status, 503);
    const whatsappHealth = await response.json();
    assert.strictEqual(whatsappHealth.configured, true);
    assert.strictEqual(whatsappHealth.runtime.webhook_requests, 0);

    response = await fetch(base + "/instagram/health");
    assert.strictEqual(response.status, 503);
    const instagramHealth = await response.json();
    assert.strictEqual(instagramHealth.configured, false);
    assert.strictEqual(instagramHealth.runtime.last_error_code, null);
    assert.strictEqual(instagramHealth.runtime.last_error_subcode, null);
    assert.strictEqual(instagramHealth.runtime.last_error_type, null);

    response = await fetch(base + "/admin/panel-demo?tab=channels");
    assert.strictEqual(response.status, 200);
    const html = await response.text();
    assert(html.includes("Finaliza el entrenamiento de tu Nextfor"));
    assert(html.includes('id="commerceConnectorCards"'));
    assert(html.includes("Conecta tu tienda"));
    assert(html.includes("fallbackChannelConnections"));
    assert(html.includes("WhatsApp"));
    assert(html.includes("Instagram"));
    assert(html.includes("Facebook Messenger"));
    assert(!html.toLowerCase().includes("access token"));

    console.log("channel-connections-production-ready.test.js: ok");
  } finally {
    child.kill("SIGTERM");
  }
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
