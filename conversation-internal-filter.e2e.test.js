"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const http = require("http");
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

async function fakeSupabase() {
  const rows = [];
  const port = await availablePort();
  const server = http.createServer(function (req, res) {
    if (req.method === "POST" && req.url.startsWith("/rest/v1/conversation_logs")) {
      let body = "";
      req.on("data", function (chunk) { body += chunk; });
      req.on("end", function () {
        rows.push(JSON.parse(body || "{}"));
        res.writeHead(201, { "content-type": "application/json" });
        res.end("{}");
      });
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/rest/v1/conversation_logs")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(rows.slice().reverse()));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end("[]");
  });
  await new Promise(function (resolve, reject) {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { server, url: "http://127.0.0.1:" + port, rows };
}

(async function run() {
  const appPort = await availablePort();
  const supabase = await fakeSupabase();
  const commerceSecret = "conversation-internal-filter-secret-1234567890";
  const dashboardKey = "conversation-internal-filter-dashboard-key";
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      PORT: String(appPort),
      NODE_ENV: "test",
      DASHBOARD_KEY: dashboardKey,
      DASHBOARD_SESSION_SECRET: "conversation-internal-filter-session-secret",
      VERIFY_TOKEN: "conversation-internal-filter-verify",
      WA_TOKEN: "conversation-internal-filter-wa",
      ANTHROPIC_API_KEY: "conversation-internal-filter-anthropic",
      SUPABASE_URL: supabase.url,
      SUPABASE_KEY: "conversation-internal-filter-supabase-key",
      ALLOW_SELF_HOSTED_SUPABASE: "1",
      NEXFORIA_COMMERCE_SERVICE_SECRET: commerceSecret
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, appPort);
    const base = "http://127.0.0.1:" + appPort;
    const response = await fetch(base + "/internal/shopify/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + commerceSecret
      },
      body: JSON.stringify({
        session: [
          ["id", "offline_ravtoys.myshopify.com"],
          ["shop", "ravtoys.myshopify.com"],
          ["isOnline", false],
          ["accessToken", "private-token"],
          ["scope", "read_products"]
        ]
      })
    });
    assert.strictEqual(response.status, 200);

    supabase.rows.push(
      {
        id: "calendar-state",
        user_id: "appointment-calendar-connection",
        user_message: "internal",
        bot_reply: "[AppointmentCalendarConnectionState] encrypted-state",
        tools: ["appointment_calendar_connection_state"]
      },
      {
        id: "nextfor-signature",
        user_id: "nextfor-signature",
        user_message: "internal",
        bot_reply: "[NextforSignature] internal-signature",
        tools: ["nextfor_signature"]
      },
      {
        id: "customer-notification",
        user_id: "__nextfor_notification__:handoff-a",
        user_message: "",
        bot_reply: "[CustomerPanelNotification] encrypted-notification",
        tools: ["customer_panel_notification"]
      }
    );

    const conversations = await fetch(base + "/admin/conversations?limit=20", {
      headers: { "x-dashboard-key": dashboardKey }
    });
    assert.strictEqual(conversations.status, 200);
    const body = await conversations.json();
    assert.strictEqual(body.turns.length, 0);
    assert(!JSON.stringify(body).includes("ShopifySessionState"));
    assert(!JSON.stringify(body).includes("AppointmentCalendarConnectionState"));
    assert(!JSON.stringify(body).includes("NextforSignature"));
    assert(!JSON.stringify(body).includes("CustomerPanelNotification"));
    console.log("conversation-internal-filter.e2e.test.js OK");
  } finally {
    child.kill();
    supabase.server.close();
  }
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
