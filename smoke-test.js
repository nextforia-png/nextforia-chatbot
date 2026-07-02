const {
  parseArgs,
  configFromEnv,
  requestJson,
  requestConversations,
  alertTeam,
  summarizeFailures,
  assertCheck,
  printJson,
  withKey,
} = require("./monitor-utils");

async function main() {
  const args = parseArgs(process.argv);
  const cfg = configFromEnv(args);
  const query = args.query || process.env.SMOKE_QUERY || "juguete";
  const expectedVersion = args["expected-version"] || process.env.EXPECTED_BOT_VERSION || "";
  const failures = [];

  if (!cfg.dashboardKey) {
    failures.push("Falta DASHBOARD_KEY/ADMIN_KEY para ejecutar /admin/smoke-check y /admin/alert.");
  }

  console.log(`Smoke test RAV Bot: ${cfg.baseUrl}`);

  const health = await requestJson({
    url: `${cfg.baseUrl}/admin/health`,
    timeoutMs: cfg.timeoutMs,
    retries: cfg.coldStartRetries,
    retryDelayMs: cfg.coldStartDelayMs,
  });
  printJson("health", health);

  assertCheck(!!health.bot && !!health.bot.version, "Health no devolvio bot.version.", failures);
  if (expectedVersion) {
    assertCheck(health.bot.version === expectedVersion, `Version esperada ${expectedVersion}, pero health reporta ${health.bot && health.bot.version}.`, failures);
  }
  assertCheck(health.env && health.env.anthropic_key_present === true, "ANTHROPIC_API_KEY no aparece presente.", failures);
  assertCheck(health.env && health.env.wa_token_present === true, "WA_TOKEN no aparece presente.", failures);
  assertCheck(health.checks && health.checks.shopify_storefront === "ok", `Shopify storefront no esta ok: ${health.checks && health.checks.shopify_storefront}.`, failures);
  assertCheck(health.checks && health.checks.meta_whatsapp === "ok", `Meta WhatsApp no esta ok: ${health.checks && health.checks.meta_whatsapp}.`, failures);
  if (health.production_readiness && health.production_readiness.infrastructure_ready !== true) {
    failures.push(`Infraestructura no lista para produccion: ${(health.production_readiness.blockers || []).join(", ") || "sin detalle"}.`);
  }

  if (cfg.dashboardKey) {
    const smoke = await requestJson({
      url: withKey(`${cfg.baseUrl}/admin/smoke-check?q=${encodeURIComponent(query)}`, cfg.dashboardKey),
      key: cfg.dashboardKey,
      timeoutMs: cfg.timeoutMs,
      retries: cfg.coldStartRetries,
      retryDelayMs: cfg.coldStartDelayMs,
    });
    printJson("smoke_check", smoke);

    assertCheck(smoke.ok === true, `Smoke-check devolvio ok=false: ${smoke.error || "sin detalle"}.`, failures);
    assertCheck(smoke.search && smoke.search.products_returned > 0, `La busqueda "${query}" no devolvio productos.`, failures);
    assertCheck(smoke.selected && smoke.selected.product_from_search === true, "El producto seleccionado no viene de la busqueda real.", failures);
    assertCheck(smoke.selected && smoke.selected.price_amount > 0, `El producto seleccionado no tiene price_amount valido: ${smoke.selected && smoke.selected.price_amount}.`, failures);
    assertCheck(smoke.cart && smoke.cart.total_amount > 0, `El total del carrito salio en cero: ${smoke.cart && smoke.cart.total_amount}.`, failures);
    assertCheck(smoke.checkout && smoke.checkout.complete === true, `El checkout no quedo completo; faltan: ${smoke.checkout && smoke.checkout.final_missing_fields}.`, failures);
    assertCheck(smoke.checks && smoke.checks.cart_total_nonzero === true, "La validacion cart_total_nonzero fallo.", failures);
    assertCheck(smoke.checks && smoke.checks.checkout_fields_complete === true, "La validacion checkout_fields_complete fallo.", failures);
  }

  const conversations = await requestConversations({
    baseUrl: cfg.baseUrl,
    key: cfg.dashboardKey,
    limit: 5,
    timeoutMs: cfg.timeoutMs,
    retries: cfg.coldStartRetries,
    retryDelayMs: cfg.coldStartDelayMs,
  });
  printJson("conversations", {
    bot_version: conversations.bot_version,
    source: conversations.source,
    total_logged: conversations.total_logged,
    summary: conversations.summary,
  });

  assertCheck(conversations.source === "supabase", `Las conversaciones no estan leyendo desde Supabase; source=${conversations.source}.`, failures);

  if (failures.length) {
    const detail = summarizeFailures("Fallo la prueba de humo post-deploy", failures);
    console.error(detail);
    if (cfg.alertEnabled && cfg.dashboardKey) {
      try {
        await alertTeam({ baseUrl: cfg.baseUrl, key: cfg.dashboardKey, kind: "smoke_test_failed", detail, timeoutMs: cfg.timeoutMs });
      } catch (error) {
        console.error(`No se pudo enviar alerta interna: ${error.message}`);
      }
    }
    process.exit(1);
  }

  console.log("Smoke test OK: health, busqueda real, seleccion, total no cero y Supabase verificados.");
}

main().catch(async error => {
  const args = parseArgs(process.argv);
  const cfg = configFromEnv(args);
  const detail = `Smoke test crashed: ${error.message}\nFecha: ${new Date().toISOString()}`;
  console.error(detail);
  if (cfg.alertEnabled && cfg.dashboardKey) {
    try {
      await alertTeam({ baseUrl: cfg.baseUrl, key: cfg.dashboardKey, kind: "smoke_test_crashed", detail, timeoutMs: cfg.timeoutMs });
    } catch (alertError) {
      console.error(`No se pudo enviar alerta interna: ${alertError.message}`);
    }
  }
  process.exit(1);
});
