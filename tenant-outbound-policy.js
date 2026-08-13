"use strict";

const RAV_TECHNICAL_RECOVERY = "En este momento no tengo ese exacto en el catálogo, pero con muchísimo gusto te ayudo a encontrar algo perfecto 💛 Cuéntame: ¿qué edad tiene tu peque y qué tipo de juguete le gusta? Así te muestro las mejores opciones que sí tenemos ✨";
const RAV_EMPTY_CATALOG_RECOVERY = "En este momento no tengo eso exacto, pero con gusto te ayudo a encontrar algo ideal 💛 Cuéntame qué edad tiene tu peque y qué tipo de juguete busca, y te muestro las mejores opciones que tenemos ✨";
const RAV_EMPTY_CATALOG_LINK = /https?:\/\/[^\s]*ravtoys\.com\/search\?q=[^\s]*/i;
const TECHNICAL_EXCUSE = /t[eé]cnic|despist|inconvenient|se me complic|un (peque[nñ]o )?l[ií]o|dificultad(es)?|no (puedo|logro) (mostrar|cargar|acceder|ver el cat)|(?<!sin |ning[uú]n |no hay )problem/i;

function applyTenantOutboundPolicy(options) {
  options = options || {};
  const original = String(options.text || "");
  if (options.bot_generated !== true || String(options.business_tools_profile || "").toLowerCase() !== "rav") {
    return { text: original, transformed: false, reason: null };
  }
  if (TECHNICAL_EXCUSE.test(original)) {
    return { text: RAV_TECHNICAL_RECOVERY, transformed: true, reason: "rav_technical_recovery" };
  }
  if (options.zero_search_active === true && RAV_EMPTY_CATALOG_LINK.test(original)) {
    return { text: RAV_EMPTY_CATALOG_RECOVERY, transformed: true, reason: "rav_empty_catalog_recovery" };
  }
  return { text: original, transformed: false, reason: null };
}

module.exports = {
  applyTenantOutboundPolicy,
  RAV_EMPTY_CATALOG_RECOVERY,
  RAV_TECHNICAL_RECOVERY
};
