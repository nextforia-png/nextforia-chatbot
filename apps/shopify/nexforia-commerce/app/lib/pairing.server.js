import crypto from "node:crypto";

const TOKEN_VERSION = "nexforia-pairing-v1";
const MAX_TOKEN_AGE_SECONDS = 15 * 60;

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signingSecret() {
  return String(process.env.NEXFORIA_PAIRING_SECRET || "").trim();
}

function signPayload(encodedPayload, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${TOKEN_VERSION}.${encodedPayload}`)
    .digest("base64url");
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function cleanId(value, fieldName) {
  const cleaned = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(cleaned)) {
    const error = new Error(`invalid_${fieldName}`);
    error.code = `invalid_${fieldName}`;
    throw error;
  }
  return cleaned;
}

function cleanShopifyShop(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  let hostname = raw;
  try {
    hostname = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    hostname = raw.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
  }
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(hostname) ? hostname : "";
}

export function createPairingToken(input, options = {}) {
  const secret = String(options.secret || signingSecret()).trim();
  if (!secret) throw new Error("pairing_secret_required");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    tenant_id: cleanId(input?.tenant_id, "tenant_id"),
    bot_id: cleanId(input?.bot_id, "bot_id"),
    nonce: cleanId(input?.nonce || crypto.randomBytes(12).toString("base64url"), "nonce"),
    iat: Number(input?.iat) || now,
    exp: Number(input?.exp) || now + MAX_TOKEN_AGE_SECONDS,
  };
  const shop = cleanShopifyShop(input?.shop);
  if (shop) payload.shop = shop;
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${TOKEN_VERSION}.${encodedPayload}.${signPayload(encodedPayload, secret)}`;
}

export function verifyPairingToken(token, options = {}) {
  const secret = String(options.secret || signingSecret()).trim();
  if (!secret) {
    const error = new Error("pairing_secret_not_configured");
    error.code = "pairing_secret_not_configured";
    throw error;
  }

  const parts = String(token || "").trim().split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    const error = new Error("invalid_pairing_token");
    error.code = "invalid_pairing_token";
    throw error;
  }

  const [, encodedPayload, signature] = parts;
  const expectedSignature = signPayload(encodedPayload, secret);
  if (!timingSafeEqual(signature, expectedSignature)) {
    const error = new Error("invalid_pairing_signature");
    error.code = "invalid_pairing_signature";
    throw error;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    const error = new Error("invalid_pairing_payload");
    error.code = "invalid_pairing_payload";
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const issuedAt = Number(payload.iat || 0);
  const expiresAt = Number(payload.exp || 0);
  if (!issuedAt || !expiresAt || expiresAt < now || issuedAt > now + 60) {
    const error = new Error("expired_pairing_token");
    error.code = "expired_pairing_token";
    throw error;
  }
  if (expiresAt - issuedAt > MAX_TOKEN_AGE_SECONDS) {
    const error = new Error("pairing_token_too_long_lived");
    error.code = "pairing_token_too_long_lived";
    throw error;
  }

  return {
    tenantId: cleanId(payload.tenant_id, "tenant_id"),
    botId: cleanId(payload.bot_id, "bot_id"),
    nonce: cleanId(payload.nonce, "nonce"),
    shop: cleanShopifyShop(payload.shop),
    expiresAt,
  };
}

export function pairingErrorMessage(error) {
  switch (error?.code || error?.message) {
    case "pairing_secret_not_configured":
      return "Pairing is not configured yet. Add NEXFORIA_PAIRING_SECRET in production.";
    case "expired_pairing_token":
      return "This pairing code expired. Create a new one from NexforIA.";
    case "invalid_pairing_signature":
    case "invalid_pairing_payload":
    case "invalid_pairing_token":
      return "This pairing code is invalid. Create a new one from NexforIA.";
    case "pairing_shop_mismatch":
      return "This pairing code belongs to a different Shopify store.";
    default:
      return "Pairing failed. Create a new code from NexforIA and try again.";
  }
}
