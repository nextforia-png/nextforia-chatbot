"use strict";

const crypto = require("crypto");

const TOKEN_VERSION = "nexforia-pairing-v1";
const MAX_TOKEN_AGE_SECONDS = 15 * 60;

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function signPayload(encodedPayload, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(TOKEN_VERSION + "." + encodedPayload)
    .digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function cleanId(value, fieldName) {
  const cleaned = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(cleaned)) {
    const error = new Error("invalid_" + fieldName);
    error.code = "invalid_" + fieldName;
    throw error;
  }
  return cleaned;
}

function cleanShopifyShop(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  let hostname = raw;
  try {
    hostname = new URL(raw.includes("://") ? raw : "https://" + raw).hostname.toLowerCase();
  } catch (_) {
    hostname = raw.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
  }
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(hostname)) return "";
  return hostname;
}

function createPairingToken(input, options) {
  options = options || {};
  const secret = String(options.secret || process.env.NEXFORIA_PAIRING_SECRET || "").trim();
  if (secret.length < 32) {
    const error = new Error("pairing_secret_required");
    error.code = "pairing_secret_required";
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const shop = cleanShopifyShop(input && input.shop);
  const payload = {
    tenant_id: cleanId(input && input.tenant_id, "tenant_id"),
    bot_id: cleanId(input && input.bot_id, "bot_id"),
    nonce: cleanId(input && input.nonce || crypto.randomBytes(12).toString("base64url"), "nonce"),
    iat: Number(input && input.iat) || now,
    exp: Number(input && input.exp) || now + MAX_TOKEN_AGE_SECONDS
  };
  if (shop) payload.shop = shop;

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return TOKEN_VERSION + "." + encodedPayload + "." + signPayload(encodedPayload, secret);
}

function verifyPairingToken(token, options) {
  options = options || {};
  const secret = String(options.secret || process.env.NEXFORIA_PAIRING_SECRET || "").trim();
  if (secret.length < 32) {
    const error = new Error("pairing_secret_required");
    error.code = "pairing_secret_required";
    throw error;
  }
  const parts = String(token || "").trim().split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !safeEqual(parts[2], signPayload(parts[1], secret))) {
    const error = new Error("invalid_pairing_token");
    error.code = "invalid_pairing_token";
    throw error;
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch (_) {
    const error = new Error("invalid_pairing_token");
    error.code = "invalid_pairing_token";
    throw error;
  }
  const now = Number(options.now) || Math.floor(Date.now() / 1000);
  if (!payload.iat || !payload.exp || payload.exp < now || payload.iat > now + 60 ||
      payload.exp - payload.iat > MAX_TOKEN_AGE_SECONDS) {
    const error = new Error("expired_pairing_token");
    error.code = "expired_pairing_token";
    throw error;
  }
  return {
    tenant_id: cleanId(payload.tenant_id, "tenant_id"),
    bot_id: cleanId(payload.bot_id, "bot_id"),
    nonce: cleanId(payload.nonce, "nonce"),
    shop: cleanShopifyShop(payload.shop),
    exp: Number(payload.exp)
  };
}

module.exports = {
  MAX_TOKEN_AGE_SECONDS,
  cleanShopifyShop,
  createPairingToken,
  verifyPairingToken
};
