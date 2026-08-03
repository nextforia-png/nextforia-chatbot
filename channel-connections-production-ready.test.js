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
  assert.match(source, /runStartupProtectionDiagnostics\(\{[\s\S]*?store: channelConnectionStore,[\s\S]*?env: process\.env,[\s\S]*?log/);
  assert.match(source, /const CHANNEL_CONNECTION_TENANT_ALIASES = Object\.freeze\(\{\}\)/);
  assert.match(source, /const protectedLegacyChannelConnections = Object\.freeze\(\[\]\)/);
  assert.doesNotMatch(source, /bootstrapExistingWhatsAppConnection|registerRavWhatsAppCloudNumberIfNeeded/);
  assert.doesNotMatch(source, /retireTemporaryInstagramReviewOwners|retireMisassignedRavInstagramOwners/);
  assert.doesNotMatch(source, /syncNextforPricingJuly2026|runRavInstagramHandoffRepairOnce|runRavInstagramDeliveryVerificationOnce/);
  assert.match(source, /function instagramGraphOriginForRuntime\(runtime\)[\s\S]*?runtime\.instagramLoginType \|\| runtime\.instagram_login_type[\s\S]*?=== "instagram"[\s\S]*?"https:\/\/graph\.instagram\.com"[\s\S]*?"https:\/\/graph\.facebook\.com"/);
  assert.match(source, /function rememberConversationRuntime\(userId, runtime\)[\s\S]*?instagramLoginType: cleanRuntimeText\(runtime\.instagramLoginType \|\| runtime\.instagram_login_type/);
  assert.match(source, /async function outboundRuntimeForConversation\(userId, options\)[\s\S]*?instagramLoginType: cleanRuntimeText\(options && \(options\.instagramLoginType \|\| options\.instagram_login_type\)/);
  assert.match(source, /await handleConversation\(userId, event\.message\.text,[\s\S]*?instagram_login_type: destination\.instagramLoginType \|\| destination\.instagram_login_type/);
  assert.match(source, /const INSTAGRAM_LOGIN_APP_ID =[\s\S]*?2073069230231933/);
  assert.match(source, /instagramLoginEnabled: INSTAGRAM_LOGIN_ENABLED/);
  assert.match(source, /tenantAliases: CHANNEL_CONNECTION_TENANT_ALIASES/);
  assert.match(source, /const graphOrigin = instagramGraphOriginForRuntime\(runtime\);[\s\S]*?`\$\{graphOrigin\}\/\$\{META_GRAPH_VERSION\}\/\$\{sendId\}\/messages`/);
  assert.match(source, /instagramRuntimeState\.last_error_code = metaError\.code \|\| null/);
  assert.match(source, /instagramRuntimeState\.last_error_subcode = metaError\.error_subcode \|\| null/);
  assert.match(source, /instagramRuntimeState\.last_error_type = metaError\.type \|\| err\.code \|\| null/);
  assert.match(source, /record\.protected_legacy && record\.status === "needs_attention"/);
  assert.match(source, /const ravAliasTenant = cleanTenantId\(CHANNEL_CONNECTION_BOOTSTRAP_WHATSAPP_TENANT_ID\)/);
  assert.match(source, /function customerTenantForAuth\(auth\)[\s\S]*?auth\.version !== 2[\s\S]*?auth\.session_version !== 2[\s\S]*?return cleanTenantId\(auth\.tenant_id\)/);
  assert.match(source, /function isRavTenantId\(tenantId\)[\s\S]*?CHANNEL_CONNECTION_BOOTSTRAP_WHATSAPP_TENANT_ID/);
  assert.match(source, /handoffCustomerReply[\s\S]*?recordTurn\(/);
  assert.match(source, /if \(alias && alias\.source === "channel_connection"\) return alias/);
  assert.match(source, /const RAV_INSTAGRAM_LOGIN_OVERRIDE = process\.env\.RAV_INSTAGRAM_LOGIN_OVERRIDE === "1"/);
  assert.match(source, /const CHANNEL_CONNECTION_INSTAGRAM_RUNTIME_TENANT_ID =[\s\S]*?CHANNEL_CONNECTION_BOOTSTRAP_WHATSAPP_TENANT_ID/);
  assert.match(source, /const ravInstagramLoginWins =[\s\S]*?runtime\.channel === "instagram"[\s\S]*?\.includes\(String\(IG_SEND_ID \|\| IG_USER_ID\)\)[\s\S]*?if \(runtime && !ravInstagramLoginWins\) rows\.push\(runtime\)/);
  assert.match(source, /ambiguous_instagram_destination_ids/);
  assert.match(source, /instagram_asset_tenant_conflict/);

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
    assert((await response.text()).includes("v326-instagram-conversation-delivery"));

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
