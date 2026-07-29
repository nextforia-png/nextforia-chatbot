"use strict";

const dns = require("dns").promises;
const fs = require("fs");
const path = require("path");
const {
  parseArgs,
  configFromEnv,
  requestJson,
  summarizeFailures,
  printJson
} = require("./monitor-utils");

function localBotVersion() {
  try {
    const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
    const match = source.match(/const\s+BOT_VERSION\s*=\s*["']([^"']+)["']/);
    return match ? match[1] : "";
  } catch (_) {
    return "";
  }
}

function cleanHost(value) {
  return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

async function resolveHost(host) {
  const clean = cleanHost(host);
  if (!clean) return { ok: false, host: clean, addresses: [], error: "missing_host" };
  try {
    const addresses = await dns.resolve(clean);
    return { ok: addresses.length > 0, host: clean, addresses, error: "" };
  } catch (error) {
    return { ok: false, host: clean, addresses: [], error: error.code || error.message };
  }
}

function evaluateAppointmentLiveReadiness(input) {
  input = input || {};
  const failures = [];
  const warnings = [];
  const health = input.health || {};
  const fullHealth = input.fullHealth || null;
  const dnsResult = input.dns || {};
  const expectedVersion = input.expectedVersion || "";
  const requireDashboardKey = input.requireDashboardKey === true;
  const requirePublicEnabled = input.requirePublicEnabled === true;

  if (!health.ok) failures.push("Producción no devolvió health público OK.");
  if (expectedVersion && health.bot && health.bot.version !== expectedVersion) {
    failures.push("Versión desplegada " + (health.bot && health.bot.version || "desconocida") + " != " + expectedVersion + ".");
  }
  if (!dnsResult.ok) {
    failures.push("DNS no resuelve para " + (dnsResult.host || "api.nextforia.com") + ": " + (dnsResult.error || "sin detalle") + ".");
  }

  if (!fullHealth) {
    const message = "Sin DASHBOARD_KEY no se puede verificar appointment_readiness completo.";
    if (requireDashboardKey) failures.push(message);
    else warnings.push(message);
  } else {
    const readiness = fullHealth.appointment_readiness;
    if (!readiness) failures.push("Health autenticado no incluye appointment_readiness.");
    else {
      if (readiness.production_can_be_enabled !== true) {
        failures.push("Appointment aún no puede activarse: " + ((readiness.blockers || []).join(", ") || "sin blockers detallados") + ".");
      }
      if (requirePublicEnabled && readiness.production_ready !== true) {
        failures.push("APPOINTMENTS_PUBLIC_ENABLED no está activo o el gate final sigue bloqueado.");
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = configFromEnv(args);
  const apiHost = cleanHost(args["api-host"] || process.env.APPOINTMENT_API_HOST || "api.nextforia.com");
  const expectedVersion = args["expected-version"] || process.env.EXPECTED_BOT_VERSION || localBotVersion();
  const requireDashboardKey = args["require-dashboard-key"] === true || process.env.APPOINTMENT_VERIFY_REQUIRE_DASHBOARD_KEY === "1";
  const requirePublicEnabled = args["require-public"] === true || process.env.APPOINTMENT_VERIFY_REQUIRE_PUBLIC === "1";

  const dnsResult = await resolveHost(apiHost);
  const publicHealth = await requestJson({
    url: cfg.baseUrl + "/admin/health",
    key: "",
    timeoutMs: cfg.timeoutMs,
    retries: cfg.coldStartRetries,
    retryDelayMs: cfg.coldStartDelayMs
  });
  let fullHealth = null;
  if (cfg.dashboardKey) {
    fullHealth = await requestJson({
      url: cfg.baseUrl + "/admin/health",
      key: cfg.dashboardKey,
      timeoutMs: cfg.timeoutMs,
      retries: cfg.coldStartRetries,
      retryDelayMs: cfg.coldStartDelayMs
    });
  }

  const result = evaluateAppointmentLiveReadiness({
    health: publicHealth,
    fullHealth,
    dns: dnsResult,
    expectedVersion,
    requireDashboardKey,
    requirePublicEnabled
  });

  printJson("appointment_live_check", {
    ok: result.ok,
    base_url: cfg.baseUrl,
    expected_version: expectedVersion,
    public_version: publicHealth.bot && publicHealth.bot.version,
    api_dns: dnsResult,
    webhook_url: "https://" + apiHost + "/webhooks/elevenlabs/post-call",
    appointment_readiness: fullHealth && fullHealth.appointment_readiness || null,
    warnings: result.warnings,
    failures: result.failures
  });

  if (!result.ok) {
    console.error(summarizeFailures("Appointment live check bloqueado", result.failures));
    process.exit(1);
  }
  console.log("Appointment live check OK.");
}

if (require.main === module) {
  main().catch(function (error) {
    console.error("Appointment live check crashed: " + error.message);
    process.exit(1);
  });
}

module.exports = {
  cleanHost,
  evaluateAppointmentLiveReadiness,
  resolveHost
};
