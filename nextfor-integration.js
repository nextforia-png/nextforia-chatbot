"use strict";

function cleanText(value, fallback, max) {
  const text = String(value == null ? "" : value).trim();
  return (text || fallback || "").slice(0, max || 160);
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeReviewStatus(value) {
  const status = cleanText(value, "approved", 40).toLowerCase();
  return ["approved", "pending", "rejected"].includes(status) ? status : "pending";
}

function buildRavIntegration(env, runtime) {
  env = env || {};
  runtime = runtime || {};

  const appReviewStatus = normalizeReviewStatus(env.META_APP_REVIEW_STATUS);
  const credentialsConfigured = !!(cleanText(env.WA_TOKEN, "", 20) && cleanText(env.PHONE_NUMBER_ID, "", 120));
  const graphApiStatus = cleanText(runtime.metaWhatsappCheck, credentialsConfigured ? "not_checked" : "not_configured", 240);
  const graphApiReady = graphApiStatus === "ok";
  const realNumberActive = enabled(env.WA_LIVE_ENABLED);
  const targetDisplayPhone = cleanText(env.TENANT_DISPLAY_PHONE, "+57 301 587 2708", 40);

  let status = "review_pending";
  let label = "Esperando aprobacion de Meta";
  let nextAction = "Completar la revision de permisos de WhatsApp.";

  if (appReviewStatus === "approved") {
    status = "activation_pending";
    label = "Aprobada - falta activar el numero";
    nextAction = "Conectar y verificar " + targetDisplayPhone + " con el flujo de coexistencia de WhatsApp Business.";
  }
  if (appReviewStatus === "approved" && credentialsConfigured && realNumberActive) {
    status = graphApiStatus.indexOf("error") === 0 ? "needs_review" : "live";
    label = graphApiStatus.indexOf("error") === 0 ? "Conexion requiere revision" : "En funcionamiento";
    nextAction = graphApiStatus.indexOf("error") === 0
      ? "Revisar la credencial de WhatsApp y ejecutar de nuevo la prueba."
      : "Ejecutar una conversacion real y confirmar respuesta, historial e intervencion humana.";
  }

  return Object.freeze({
    id: "rav-whatsapp-sales",
    integration_number: 1,
    tenant_id: cleanText(env.DEFAULT_TENANT_ID, "rav-toys", 80),
    brand_name: cleanText(env.TENANT_BRAND_NAME, "RAV Toys", 120),
    bot_name: "Atencion al cliente",
    provider: "Meta WhatsApp Cloud API",
    status,
    label,
    next_action: nextAction,
    target_display_phone: targetDisplayPhone,
    app_review: Object.freeze({
      status: appReviewStatus,
      approved: appReviewStatus === "approved",
      approved_at: appReviewStatus === "approved"
        ? cleanText(env.META_APP_REVIEW_APPROVED_AT, "2026-07-24", 40)
        : null
    }),
    connection: Object.freeze({
      credentials_configured: credentialsConfigured,
      graph_api_status: graphApiStatus,
      graph_api_ready: graphApiReady,
      real_number_active: realNumberActive,
      mode: realNumberActive ? "live" : (credentialsConfigured ? "test" : "unconfigured")
    }),
    capabilities: Object.freeze({
      customer_panel: true,
      super_admin_panel: true,
      human_intervention: true,
      shopify_orders: true,
      safe_integration_test: true
    })
  });
}

module.exports = {
  buildRavIntegration
};
