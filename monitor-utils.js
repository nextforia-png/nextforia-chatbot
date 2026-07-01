const axios = require("axios");

const DEFAULT_BASE_URL = "https://rav-whatsapp-bot.onrender.com";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function configFromEnv(args = {}) {
  return {
    baseUrl: cleanBaseUrl(args["base-url"] || process.env.BOT_BASE_URL || process.env.RAV_BOT_URL || DEFAULT_BASE_URL),
    dashboardKey: args.key || process.env.DASHBOARD_KEY || process.env.ADMIN_KEY || "",
    timeoutMs: numberFrom(args.timeout || process.env.HTTP_TIMEOUT_MS, 70000),
    coldStartRetries: numberFrom(args.retries || process.env.COLD_START_RETRIES, 2),
    coldStartDelayMs: numberFrom(args["retry-delay-ms"] || process.env.COLD_START_DELAY_MS, 60000),
    alertEnabled: args["no-alert"] ? false : process.env.ALERT_ON_FAILURE !== "0",
  };
}

function cleanBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function numberFrom(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function adminHeaders(key) {
  return key ? { "x-dashboard-key": key } : {};
}

function withKey(url, key) {
  if (!key) return url;
  const glue = url.includes("?") ? "&" : "?";
  return `${url}${glue}key=${encodeURIComponent(key)}`;
}

async function requestJson({ method = "get", url, key = "", data, timeoutMs = 70000, retries = 0, retryDelayMs = 60000 }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios({
        method,
        url,
        data,
        timeout: timeoutMs,
        headers: Object.assign({ accept: "application/json" }, adminHeaders(key)),
        validateStatus: () => true,
      });
      if (response.status >= 200 && response.status < 300) {
        return response.data;
      }
      lastError = new Error(`HTTP ${response.status}: ${JSON.stringify(response.data).slice(0, 300)}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < retries) {
      await sleep(retryDelayMs);
    }
  }
  throw lastError;
}

async function requestConversations({ baseUrl, limit = 100, timeoutMs = 70000, retries = 0, retryDelayMs = 60000 }) {
  let lastData;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      lastData = await requestJson({
        url: `${baseUrl}/admin/conversations?limit=${encodeURIComponent(limit)}`,
        timeoutMs,
        retries: 0,
      });
      if (lastData && lastData.source === "supabase") return lastData;
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) await sleep(retryDelayMs);
  }
  if (!lastData && lastError) throw lastError;
  return lastData;
}

async function alertTeam({ baseUrl, key, kind, detail, timeoutMs = 70000 }) {
  if (!key) return { skipped: true, reason: "missing_dashboard_key" };
  return requestJson({
    method: "post",
    url: `${baseUrl}/admin/alert`,
    key,
    data: { kind, detail },
    timeoutMs,
    retries: 0,
  });
}

function summarizeFailures(title, failures) {
  return [
    title,
    "",
    ...failures.map((failure, index) => `${index + 1}. ${failure}`),
    "",
    `Fecha: ${new Date().toISOString()}`,
  ].join("\n");
}

function assertCheck(condition, message, failures) {
  if (!condition) failures.push(message);
}

function printJson(label, data) {
  console.log(`${label}: ${JSON.stringify(data, null, 2)}`);
}

module.exports = {
  DEFAULT_BASE_URL,
  parseArgs,
  configFromEnv,
  requestJson,
  requestConversations,
  alertTeam,
  summarizeFailures,
  assertCheck,
  printJson,
  sleep,
  withKey,
};
