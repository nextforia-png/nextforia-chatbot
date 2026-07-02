const {
  parseArgs,
  configFromEnv,
  requestJson,
  requestConversations,
  alertTeam,
  summarizeFailures,
  assertCheck,
  printJson,
  sleep,
} = require("./monitor-utils");

function getThresholds(args) {
  return {
    maxErrorTurns: Number(args["max-error-turns"] || process.env.MONITOR_MAX_ERROR_TURNS || 0),
    maxHandoffRate: Number(args["max-handoff-rate"] || process.env.MONITOR_MAX_HANDOFF_RATE || 0.4),
    maxZeroResultRate: Number(args["max-zero-result-rate"] || process.env.MONITOR_MAX_ZERO_RESULT_RATE || 0.35),
    repeatedZeroQueryCount: Number(args["repeated-zero-query-count"] || process.env.MONITOR_REPEATED_ZERO_QUERY_COUNT || 3),
    maxActiveHandoffs: Number(args["max-active-handoffs"] || process.env.MONITOR_MAX_ACTIVE_HANDOFFS || 10),
  };
}

function rate(part, total) {
  return total > 0 ? part / total : 0;
}

async function runOnce(cfg, thresholds) {
  const failures = [];
  const warnings = [];

  const health = await requestJson({
    url: `${cfg.baseUrl}/admin/health`,
    timeoutMs: cfg.timeoutMs,
    retries: cfg.coldStartRetries,
    retryDelayMs: cfg.coldStartDelayMs,
  });
  const stats = await requestJson({
    url: `${cfg.baseUrl}/admin/stats`,
    key: cfg.dashboardKey,
    timeoutMs: cfg.timeoutMs,
    retries: cfg.coldStartRetries,
    retryDelayMs: cfg.coldStartDelayMs,
  });
  const conversations = await requestConversations({
    baseUrl: cfg.baseUrl,
    key: cfg.dashboardKey,
    limit: 100,
    timeoutMs: cfg.timeoutMs,
    retries: cfg.coldStartRetries,
    retryDelayMs: cfg.coldStartDelayMs,
  });

  assertCheck(health.checks && health.checks.shopify_storefront === "ok", `Shopify storefront no esta ok: ${health.checks && health.checks.shopify_storefront}.`, failures);
  assertCheck(health.checks && health.checks.meta_whatsapp === "ok", `Meta WhatsApp no esta ok: ${health.checks && health.checks.meta_whatsapp}.`, failures);
  assertCheck(health.env && health.env.anthropic_key_present === true, "ANTHROPIC_API_KEY no aparece presente.", failures);
  assertCheck(health.env && health.env.wa_token_present === true, "WA_TOKEN no aparece presente.", failures);
  assertCheck(conversations.source === "supabase", `Conversaciones no vienen de Supabase; source=${conversations.source}.`, failures);
  if (health.production_readiness && health.production_readiness.infrastructure_ready !== true) {
    failures.push(`Infraestructura no lista para produccion: ${(health.production_readiness.blockers || []).join(", ") || "sin detalle"}.`);
  }

  const summary = conversations.summary || {};
  const turns = conversations.turns || [];
  const zeroRate = rate(summary.turns_with_zero_results || 0, summary.turns_logged || 0);
  const handoffRate = rate(summary.turns_with_handoff || 0, summary.turns_logged || 0);
  const activeHandoffs = stats.current_state ? stats.current_state.active_handoffs : 0;

  if ((summary.turns_with_error || 0) > thresholds.maxErrorTurns) {
    failures.push(`Hay ${summary.turns_with_error} turnos con status != ok en las ultimas conversaciones.`);
  }
  if (handoffRate > thresholds.maxHandoffRate && (summary.turns_logged || 0) >= 10) {
    warnings.push(`Handoff alto: ${Math.round(handoffRate * 100)}% (${summary.turns_with_handoff}/${summary.turns_logged}).`);
  }
  if (zeroRate > thresholds.maxZeroResultRate && (summary.turns_logged || 0) >= 10) {
    warnings.push(`Busquedas sin resultado altas: ${Math.round(zeroRate * 100)}% (${summary.turns_with_zero_results}/${summary.turns_logged}).`);
  }
  if (activeHandoffs > thresholds.maxActiveHandoffs) {
    warnings.push(`Handoffs activos altos: ${activeHandoffs}.`);
  }
  if (stats.anthropic && stats.anthropic.credit_errors > 0) {
    failures.push(`Anthropic reporta credit_errors=${stats.anthropic.credit_errors}.`);
  }

  const zeroQueries = new Map();
  for (const turn of turns) {
    for (const query of turn.zeroResultQueries || []) {
      const key = String(query || "").toLowerCase().trim();
      if (key) zeroQueries.set(key, (zeroQueries.get(key) || 0) + 1);
    }
  }
  for (const [query, count] of zeroQueries.entries()) {
    if (count >= thresholds.repeatedZeroQueryCount) {
      warnings.push(`Busqueda repetida sin resultado: "${query}" (${count} veces).`);
    }
  }

  const report = {
    bot_version: health.bot && health.bot.version,
    source: conversations.source,
    turns_logged: summary.turns_logged || 0,
    errors: summary.turns_with_error || 0,
    handoff_rate: Math.round(handoffRate * 100),
    zero_result_rate: Math.round(zeroRate * 100),
    active_handoffs: activeHandoffs,
    infrastructure_ready: !!(health.production_readiness && health.production_readiness.infrastructure_ready),
    failures,
    warnings,
  };
  printJson("monitor", report);

  return { failures, warnings, report };
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = configFromEnv(args);
  const thresholds = getThresholds(args);
  const intervalMs = Number(args.interval || process.env.MONITOR_INTERVAL_MS || 0);
  const shouldLoop = !!args.loop || intervalMs > 0;

  do {
    const { failures, warnings } = await runOnce(cfg, thresholds);
    const issues = failures.concat(warnings);
    if (issues.length) {
      const detail = summarizeFailures("Monitor RAV Bot encontro anomalias", issues);
      console.error(detail);
      if (cfg.alertEnabled && cfg.dashboardKey) {
        try {
          await alertTeam({ baseUrl: cfg.baseUrl, key: cfg.dashboardKey, kind: failures.length ? "monitor_failure" : "monitor_warning", detail, timeoutMs: cfg.timeoutMs });
        } catch (error) {
          console.error(`No se pudo enviar alerta interna: ${error.message}`);
        }
      }
      if (failures.length && !shouldLoop) process.exit(1);
    } else {
      console.log("Monitor OK: dependencias, Supabase y KPIs dentro de umbrales.");
    }

    if (shouldLoop) {
      await sleep(intervalMs || 300000);
    }
  } while (shouldLoop);
}

main().catch(async error => {
  const args = parseArgs(process.argv);
  const cfg = configFromEnv(args);
  const detail = `Monitor crashed: ${error.message}\nFecha: ${new Date().toISOString()}`;
  console.error(detail);
  if (cfg.alertEnabled && cfg.dashboardKey) {
    try {
      await alertTeam({ baseUrl: cfg.baseUrl, key: cfg.dashboardKey, kind: "monitor_crashed", detail, timeoutMs: cfg.timeoutMs });
    } catch (alertError) {
      console.error(`No se pudo enviar alerta interna: ${alertError.message}`);
    }
  }
  process.exit(1);
});
