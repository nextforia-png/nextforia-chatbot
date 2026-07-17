const fs = require("fs");
const path = require("path");
const {
  parseArgs,
  configFromEnv,
  requestJson,
  alertTeam,
  summarizeFailures,
  sleep,
  printJson,
} = require("./monitor-utils");

function localBotVersion() {
  try {
    const indexPath = path.join(__dirname, "index.js");
    const source = fs.readFileSync(indexPath, "utf8");
    const match = source.match(/const\s+BOT_VERSION\s*=\s*["']([^"']+)["']/);
    return match ? match[1] : "";
  } catch (_) {
    return "";
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = configFromEnv(args);
  const expectedVersion = args["expected-version"] || process.env.EXPECTED_BOT_VERSION || localBotVersion();
  const timeoutMs = Number(args["deploy-timeout-ms"] || process.env.DEPLOY_VERIFY_TIMEOUT_MS || 5 * 60 * 1000);
  const intervalMs = Number(args["deploy-interval-ms"] || process.env.DEPLOY_VERIFY_INTERVAL_MS || 30000);
  const startedAt = Date.now();
  const failures = [];
  let lastHealth = null;
  let lastError = null;

  if (!expectedVersion) {
    console.error("No pude determinar EXPECTED_BOT_VERSION ni leer BOT_VERSION desde index.js.");
    process.exit(2);
  }

  console.log(`Verificando deploy en ${cfg.baseUrl}; version esperada: ${expectedVersion}`);

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      lastHealth = await requestJson({
        url: `${cfg.baseUrl}/admin/health`,
        key: cfg.dashboardKey,
        timeoutMs: cfg.timeoutMs,
        retries: 0,
      });
      printJson("health", {
        version: lastHealth.bot && lastHealth.bot.version,
        checks: lastHealth.checks,
      });

      const deployedVersion = lastHealth.bot && lastHealth.bot.version;
      if (deployedVersion === expectedVersion) {
        if (lastHealth.checks && lastHealth.checks.shopify_storefront !== "ok") {
          failures.push(`Shopify storefront no esta ok: ${lastHealth.checks.shopify_storefront}.`);
        }
        if (lastHealth.checks && lastHealth.checks.meta_whatsapp !== "ok") {
          failures.push(`Meta WhatsApp no esta ok: ${lastHealth.checks.meta_whatsapp}.`);
        }
        if (lastHealth.env && lastHealth.env.anthropic_key_present !== true) {
          failures.push("ANTHROPIC_API_KEY no aparece presente.");
        }
        if (lastHealth.env && lastHealth.env.wa_token_present !== true) {
          failures.push("WA_TOKEN no aparece presente.");
        }
        if (failures.length) break;
        console.log(`Deploy verificado: ${expectedVersion} esta activo y health esta OK.`);
        return;
      }
      lastError = new Error(`version actual ${deployedVersion || "desconocida"} != ${expectedVersion}`);
    } catch (error) {
      lastError = error;
      console.error(`Health aun no esta listo: ${error.message}`);
    }
    await sleep(intervalMs);
  }

  if (!failures.length) {
    failures.push(`No se vio la version ${expectedVersion} antes del timeout. Ultimo estado: ${lastError ? lastError.message : "sin respuesta"}.`);
  }
  const detail = summarizeFailures("Verificacion de deploy fallo", failures);
  console.error(detail);
  if (cfg.alertEnabled && cfg.dashboardKey) {
    try {
      await alertTeam({ baseUrl: cfg.baseUrl, key: cfg.dashboardKey, kind: "deploy_verify_failed", detail, timeoutMs: cfg.timeoutMs });
    } catch (alertError) {
      console.error(`No se pudo enviar alerta interna: ${alertError.message}`);
    }
  }
  process.exit(1);
}

main().catch(async error => {
  const args = parseArgs(process.argv);
  const cfg = configFromEnv(args);
  const detail = `Verify deploy crashed: ${error.message}\nFecha: ${new Date().toISOString()}`;
  console.error(detail);
  if (cfg.alertEnabled && cfg.dashboardKey) {
    try {
      await alertTeam({ baseUrl: cfg.baseUrl, key: cfg.dashboardKey, kind: "deploy_verify_crashed", detail, timeoutMs: cfg.timeoutMs });
    } catch (alertError) {
      console.error(`No se pudo enviar alerta interna: ${alertError.message}`);
    }
  }
  process.exit(1);
});
