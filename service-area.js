"use strict";

const { parsePhoneNumberFromString } = require("libphonenumber-js/min");

function normalizeCountryCode(value, fallback) {
  const code = String(value || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return code;
  const fallbackCode = String(fallback || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(fallbackCode) ? fallbackCode : "CO";
}

function detectPhoneCountry(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  try {
    const parsed = parsePhoneNumberFromString("+" + digits);
    return parsed && parsed.country ? parsed.country : null;
  } catch (_) {
    return null;
  }
}

function serviceAreaCheckForPhone(value, config) {
  config = config || {};
  const serviceCountryCode = normalizeCountryCode(config.countryCode, "CO");
  const phoneCountryCode = detectPhoneCountry(value);
  return {
    enabled: config.enabled !== false,
    serviceCountryCode,
    serviceCountryName: String(config.countryName || "Colombia").trim().slice(0, 80) || "Colombia",
    phoneCountryCode,
    shouldAsk: config.enabled !== false && !!phoneCountryCode && phoneCountryCode !== serviceCountryCode
  };
}

function normalizedReply(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyServiceAreaReply(value, countryName) {
  const punctuated = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const text = normalizedReply(value);
  const country = normalizedReply(countryName || "Colombia");
  if (!text) return "unclear";

  if (country && text.includes(country)) {
    if (/^no\s*[,;]\s*(estoy|vivo|me encuentro)\s+en\b/.test(punctuated)) return "inside";
    if (new RegExp("\\b(no estoy|no vivo|fuera de|outside)\\b").test(text)) return "outside";
    return "inside";
  }
  if (/^(si|yes|yep|claro|correcto|exacto|afirmativo)(\s|$)/.test(text)) return "inside";
  if (/^(no|nope|not)(\s|$)/.test(text)) return "outside";
  if (/\b(estoy|vivo|me encuentro)\s+(fuera|en el exterior)\b/.test(text)) return "outside";
  if (/\b(envio internacional|entrega internacional|international shipping|outside the country)\b/.test(text)) return "outside";
  return "unclear";
}

function buildServiceAreaQuestion(config) {
  const countryName = String(config && config.countryName || "Colombia").trim().slice(0, 80) || "Colombia";
  return "¡Hola! 😊 Parece que tu número es de otro país. ¿Te encuentras en " + countryName + " o necesitas que la entrega sea dentro de " + countryName + "? Así puedo orientarte correctamente 💛";
}

function buildServiceAreaContext(state, config) {
  if (!state) return "";
  const countryName = String(config && config.countryName || "Colombia").trim().slice(0, 80) || "Colombia";
  const status = ["pending", "inside", "outside", "unclear"].includes(state.status) ? state.status : "unclear";
  const lines = [
    "VERIFICACION DE ZONA DE SERVICIO:",
    "- El numero del cliente parece pertenecer a otro pais. Esto no demuestra su ubicacion actual.",
    "- Pais o mercado atendido por este negocio: " + countryName + ".",
    "- Estado de la confirmacion: " + status + "."
  ];
  if (status === "inside") {
    lines.push("- El cliente confirmo que esta en " + countryName + " o que la entrega sera dentro del pais. Continua con su consulta original y no vuelvas a preguntarlo.");
  } else if (status === "outside") {
    lines.push("- El cliente indico que esta fuera de " + countryName + ". Explica con amabilidad la cobertura disponible y pregunta si cuenta con una direccion de entrega dentro de " + countryName + ". No prometas envios internacionales.");
  } else {
    lines.push("- El cliente no confirmo claramente la ubicacion o destino. No repitas la pregunta general: continua con su consulta y confirma la ciudad o direccion solo cuando sea necesario para una entrega. No asumas el pais por el numero.");
  }
  return lines.join("\n");
}

module.exports = {
  buildServiceAreaContext,
  buildServiceAreaQuestion,
  classifyServiceAreaReply,
  detectPhoneCountry,
  normalizeCountryCode,
  serviceAreaCheckForPhone
};
