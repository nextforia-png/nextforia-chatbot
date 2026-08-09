"use strict";

const crypto = require("crypto");
const { decryptStoredText, encryptStoredText, safeEqualText } = require("./security");

const SUPPORTED_CHANNELS = ["whatsapp", "instagram", "messenger"];
const CONNECTION_STATUSES = ["not_connected", "connecting", "connected", "needs_attention", "disconnected"];
const WHATSAPP_REGISTRATION_COOLDOWN_MS = 72 * 60 * 60 * 1000;
const CHANNEL_CATALOG = Object.freeze([
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Recomendado. Aquí es donde tu Nextfor empezará a atender primero.",
    available: true
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Instagram profesional se autoriza desde Meta, donde se administran sus mensajes.",
    available: true
  },
  {
    id: "messenger",
    name: "Facebook Messenger",
    description: "Opcional. Súmalo si tus clientes también te escriben por Facebook.",
    available: true
  }
]);

class ChannelConnectionError extends Error {
  constructor(code, status, internalMessage) {
    super(code);
    this.name = "ChannelConnectionError";
    this.code = code;
    this.status = Number(status) || 422;
    this.internalMessage = String(internalMessage || code).slice(0, 800);
  }
}

function cleanTenantId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 80);
}

function cleanChannel(value) {
  const channel = String(value || "").trim().toLowerCase();
  return SUPPORTED_CHANNELS.includes(channel) ? channel : "";
}

function cleanText(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max || 240);
}

function cleanWhatsAppRegistrationPin(value) {
  const pin = cleanText(value, 12);
  return /^\d{6}$/.test(pin) ? pin : "";
}

function cleanWhatsAppOnboardingMode(value) {
  const mode = cleanText(value, 40).toLowerCase();
  return mode === "coexistence" || mode === "cloud_api" ? mode : "";
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function actorLabel(actor) {
  if (typeof actor === "string") return cleanText(actor, 200) || "system";
  return cleanText(actor && (actor.email || actor.username || actor.user_id || actor.name), 200) || "system";
}

function internalError(error) {
  const data = error && error.response && error.response.data;
  const message = data && (data.error_message || data.error_description) ||
    data && data.error && (data.error.message || data.error.type) ||
    data && data.message ||
    error && error.internalMessage ||
    error && error.message ||
    "meta_connection_failed";
  return cleanText(message, 800);
}

function metaErrorTelemetry(error) {
  const data = error && error.response && error.response.data;
  const meta = data && data.error && typeof data.error === "object" ? data.error : {};
  return {
    meta_code: Number.isFinite(Number(meta.code)) ? Number(meta.code) : null,
    meta_subcode: Number.isFinite(Number(meta.error_subcode)) ? Number(meta.error_subcode) : null,
    meta_type: cleanText(meta.type, 120) || null,
    meta_transient: meta.is_transient === true,
    meta_trace_id: cleanText(meta.fbtrace_id, 160) || null,
    meta_message: cleanText(meta.message || internalError(error), 500)
      .replace(/(access[_ -]?token|bearer)\s*[:=]?\s*[^\s,;]+/gi, "$1 [redacted]")
  };
}

function isWhatsAppRegistrationRateLimit(value) {
  const message = cleanText(
    value && value.meta && value.meta.meta_message || value && value.internalMessage || value,
    800
  ).toLowerCase();
  const metaCode = Number(value && value.meta && value.meta.meta_code);
  return metaCode === 133016 || /133016|too many attempts.*(?:phone|registration|deregistration)|registration or deregistration failed because there were too many attempts/.test(message);
}

function isDefinitiveWhatsAppRegistrationRejection(error) {
  const meta = error && error.meta || {};
  const metaCode = Number(meta.meta_code);
  const httpStatus = Number(error && error.http_status);
  if (meta.meta_transient === true || httpStatus === 408 || httpStatus === 429 || httpStatus >= 500) return false;
  const definitiveCodes = new Set([
    10, 100, 190, 200,
    133004, 133005, 133006, 133008, 133009, 133010, 133015, 133016
  ]);
  return Number.isFinite(metaCode) && definitiveCodes.has(metaCode);
}

function whatsappActivationRetryAt(record, referenceTime) {
  if (!record || !isWhatsAppRegistrationRateLimit(record.last_error)) return null;
  const failedAt = new Date(record.last_error_at || 0).getTime();
  if (!Number.isFinite(failedAt) || failedAt <= 0) return null;
  const retryAt = failedAt + WHATSAPP_REGISTRATION_COOLDOWN_MS;
  const current = new Date(referenceTime || Date.now()).getTime();
  return retryAt > current ? new Date(retryAt).toISOString() : null;
}

function customerActivationError(value) {
  const message = cleanText(value, 800).toLowerCase();
  if (!message) return null;
  if (isWhatsAppRegistrationRateLimit(message)) {
    return "Meta bloqueó temporalmente nuevos registros por demasiados intentos. Nextfor no volverá a intentarlo hasta que termine el bloqueo."
  }
  if (/token|oauth|session.*expir|authorization|autorizaci/.test(message)) {
    return "La autorización de Meta venció o fue revocada. Vuelve a autorizar WhatsApp."
  }
  if (/permission|permiso|insufficient scope/.test(message)) {
    return "Meta no concedió todos los permisos de WhatsApp necesarios. Vuelve a autorizar la cuenta."
  }
  if (/pin|two.step|two factor|2fa/.test(message)) {
    return "Meta no pudo establecer la verificación segura del número. Vuelve a autorizar WhatsApp desde este panel."
  }
  if (/already|registered|another business|otro negocio|portfolio|portafolio/.test(message)) {
    return "Meta indica que el número ya está registrado o pertenece a otro portafolio empresarial."
  }
  if (/cloud api|registration|register|activat/.test(message)) {
    return "Meta todavía no completó el registro de este número en Cloud API. Puedes reintentar aquí."
  }
  return "Meta rechazó la activación del número. Puedes reintentar o volver a autorizar la cuenta."
}

function mapStoreError(error) {
  if (error instanceof ChannelConnectionError) return error;
  const status = error && error.response && error.response.status;
  const storeCode = cleanText(error && error.response && error.response.data && error.response.data.code, 40);
  const detail = internalError(error);
  if (/WHATSAPP_REGISTRATION_COOLDOWN/.test(detail)) {
    return new ChannelConnectionError("whatsapp_activation_rate_limited", 429, detail);
  }
  if (/WHATSAPP_ASSET_ALREADY_ASSIGNED/.test(detail)) {
    return new ChannelConnectionError("channel_asset_already_assigned", 409, detail);
  }
  if (status === 404) return new ChannelConnectionError("connection_not_found", 404, detail);
  if (status === 409 || storeCode === "23505") {
    return new ChannelConnectionError("channel_asset_already_assigned", 409, detail);
  }
  return new ChannelConnectionError("channel_store_unavailable", 503, detail);
}

function emptyConnection(tenantId, channel) {
  return {
    tenant_id: cleanTenantId(tenantId),
    channel,
    status: "not_connected",
    account_id: null,
    account_label: null,
    meta_business_id: null,
    whatsapp_business_account_id: null,
    phone_number_id: null,
    page_id: null,
    instagram_user_id: null,
    webhook_status: "not_configured",
    last_verified_at: null,
    last_error: null,
    last_error_at: null,
    connected_at: null,
    disconnected_at: null,
    connected_by: null,
    disconnected_by: null,
    updated_at: null,
    pending_assets: [],
    credentials_ciphertext: null,
    credential_source: null,
    registration_pin_required: false,
    onboarding_attempt_id: null,
    onboarding_attempt_status: null,
    onboarding_attempt_started_at: null,
    onboarding_attempt_updated_at: null,
    onboarding_attempt_registration_requested_at: null,
    onboarding_attempt_registration_accepted_at: null,
    onboarding_attempt_subscription_confirmed_at: null,
    onboarding_attempt_phone_number_id: null,
    onboarding_attempt_waba_id: null,
    onboarding_attempt_ciphertext: null,
    onboarding_attempt_last_error: null,
    onboarding_attempt_last_error_at: null,
    onboarding_attempt_reconcile_count: 0,
    onboarding_attempt_reconcile_after: null,
    onboarding_attempt_reconcile_lease_until: null,
    onboarding_attempt_reconcile_owner: null,
    whatsapp_last_registration_phone_number_id: null,
    whatsapp_last_registration_requested_at: null,
    protected_legacy: false
  };
}

function whatsappAttemptRecordIsActive(record) {
  const status = cleanText(record && record.onboarding_attempt_status, 80).toLowerCase();
  return !!(record && record.onboarding_attempt_id && !["completed", "cancelled"].includes(status));
}

function publicConnection(record, options) {
  const safe = Object.assign(emptyConnection(record && record.tenant_id, record && record.channel), record || {});
  const hasStoredCredentials = !!safe.credentials_ciphertext;
  // A disconnected row is kept for audit history, but its previous asset must
  // never look assigned in the Customer Panel or participate in routing.
  if (["not_connected", "disconnected"].includes(safe.status)) {
    safe.account_id = null;
    safe.account_label = null;
    safe.meta_business_id = null;
    safe.whatsapp_business_account_id = null;
    safe.phone_number_id = null;
    safe.page_id = null;
    safe.instagram_user_id = null;
  }
  const attemptStatus = cleanText(safe.onboarding_attempt_status, 80).toLowerCase();
  const attemptTerminal = ["completed", "cancelled"].includes(attemptStatus);
  const attemptActive = safe.channel === "whatsapp" && !!safe.onboarding_attempt_id && !attemptTerminal;
  safe.onboarding_attempt_active = attemptActive;
  safe.onboarding_attempt_stage = attemptActive ? attemptStatus || "awaiting_meta" : null;
  safe.cancel_attempt_available = attemptActive && (
    !safe.onboarding_attempt_registration_requested_at ||
    ["registration_rejected", "reconciliation_exhausted"].includes(attemptStatus)
  );
  safe.onboarding_attempt_message = attemptActive
    ? attemptStatus === "registration_rejected"
      ? "Meta rechazó el registro de este número. Puedes descartar este intento y conectar un número diferente; Nextfor no repetirá el anterior."
      : attemptStatus === "reconciliation_exhausted"
        ? "No pudimos confirmar este número dentro de la ventana segura. Puedes descartar el intento y conectar un número diferente."
      : attemptStatus === "failed"
      ? safe.onboarding_attempt_registration_requested_at
        ? "Hubo un problema después de solicitar el registro. Nextfor comprobará el resultado sin repetirlo."
        : customerActivationError(safe.onboarding_attempt_last_error) || "No pudimos terminar esta conexión. Cancela el intento y vuelve a conectar un número nuevo."
      : attemptStatus === "registration_outcome_unknown"
        ? "No repetiremos el registro. Estamos comprobando con Meta si el número quedó conectado."
        : "Nextfor está terminando y verificando la conexión sin repetir el registro del número."
    : null;
  const allowProtectedReconnect = !!(options && options.allowProtectedReconnect);
  const reconnectAllowed = !safe.protected_legacy || allowProtectedReconnect;
  const coexistencePending = safe.channel === "whatsapp" &&
    safe.webhook_status === "pending_activation" && safe.coexistence_confirmed === true;
  const activationRetryAt = safe.channel === "whatsapp" && !coexistencePending
    ? whatsappActivationRetryAt(safe, options && options.now)
    : null;
  safe.activation_rate_limited = !!activationRetryAt;
  safe.activation_retry_at = activationRetryAt;
  safe.activation_available = safe.channel === "whatsapp" &&
    !safe.activation_rate_limited &&
    !safe.protected_legacy &&
    !!safe.credentials_ciphertext &&
    !!(safe.phone_number_id && safe.whatsapp_business_account_id) &&
    (safe.status === "connecting" || safe.status === "needs_attention");
  const ignoreObsoleteRegistrationError = coexistencePending && isWhatsAppRegistrationRateLimit(safe.last_error);
  safe.activation_error = safe.channel === "whatsapp" && !ignoreObsoleteRegistrationError
    ? customerActivationError(safe.last_error)
    : null;
  safe.activation_message = safe.activation_rate_limited
    ? "Meta limitó temporalmente registros anteriores. Nextfor no repetirá llamadas hasta que Meta vuelva a permitir la activación."
    : safe.activation_error || (safe.activation_available
    ? safe.webhook_status === "pending_activation"
      ? "Meta todavía no confirmó la activación. Revisar estado no vuelve a registrar el número."
      : "La activación de WhatsApp necesita atención. Revisa el estado o vuelve a autorizar con el tipo de número correcto."
    : null);
  // The PIN is an implementation detail generated and encrypted by Nextfor.
  // Customers complete onboarding entirely through Embedded Signup.
  safe.registration_pin_required = false;
  delete safe.credentials_ciphertext;
  delete safe.credential_source;
  delete safe.coexistence_confirmed;
  safe.pending_assets = safe.status === "connecting"
    ? (Array.isArray(safe.pending_assets) ? safe.pending_assets : []).map(function (asset) {
        return {
          id: cleanText(asset && asset.id, 240),
          label: cleanText(asset && asset.label, 240),
          detail: cleanText(asset && asset.detail, 240)
        };
      }).filter(function (asset) { return asset.id && asset.label; })
    : [];
  safe.requires_selection = safe.status === "connecting" && safe.pending_assets.length > 1;
  safe.disconnect_available = !safe.protected_legacy && hasStoredCredentials &&
    ["connected", "needs_attention"].includes(safe.status);
  safe.reconnect_available = reconnectAllowed && !safe.activation_rate_limited && (
    ["connected", "needs_attention", "disconnected"].includes(safe.status)
    || (safe.status === "connecting" && safe.pending_assets.length === 0)
  );
  safe.connect_available = !safe.protected_legacy && !attemptActive &&
    ["not_connected", "disconnected"].includes(safe.status);
  if (safe.channel === "whatsapp" && options && options.whatsappOnboardingAvailable === false) {
    safe.connect_available = false;
    safe.reconnect_available = false;
  }
  delete safe.onboarding_attempt_ciphertext;
  delete safe.onboarding_attempt_phone_number_id;
  delete safe.onboarding_attempt_waba_id;
  delete safe.onboarding_attempt_last_error;
  delete safe.onboarding_attempt_last_error_at;
  delete safe.onboarding_attempt_reconcile_count;
  delete safe.onboarding_attempt_reconcile_after;
  delete safe.onboarding_attempt_reconcile_lease_until;
  delete safe.onboarding_attempt_reconcile_owner;
  delete safe.whatsapp_last_registration_phone_number_id;
  delete safe.whatsapp_last_registration_requested_at;
  if (!(options && options.superAdmin)) {
    delete safe.last_error;
    delete safe.last_error_at;
    delete safe.meta_business_id;
    delete safe.whatsapp_business_account_id;
    delete safe.phone_number_id;
    delete safe.page_id;
    delete safe.instagram_user_id;
    delete safe.connected_by;
    delete safe.disconnected_by;
    delete safe.protected_legacy;
  }
  return safe;
}

function createOAuthState(secret, input, now) {
  const key = String(secret || "");
  if (key.length < 32) throw new ChannelConnectionError("channel_oauth_not_configured", 503, "OAuth state secret is missing");
  const payload = Buffer.from(JSON.stringify({
    v: 2,
    tenant_id: cleanTenantId(input && input.tenant_id),
    channel: cleanChannel(input && input.channel),
    actor_id: cleanText(input && input.actor_id, 200),
    actor: cleanText(input && input.actor, 200),
    redirect_uri: cleanText(input && input.redirect_uri, 500),
    return_path: cleanText(input && input.return_path, 500),
    return_mode: input && input.return_mode === "popup" ? "popup" : "",
    whatsapp_onboarding_mode: cleanChannel(input && input.channel) === "whatsapp"
      ? cleanWhatsAppOnboardingMode(input && input.whatsapp_onboarding_mode)
      : "",
    whatsapp_attempt_id: cleanChannel(input && input.channel) === "whatsapp"
      ? cleanText(input && input.whatsapp_attempt_id, 100)
      : "",
    nonce: crypto.randomBytes(24).toString("base64url"),
    exp: Number(now || Date.now()) + 10 * 60 * 1000
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", key).update("channel-oauth." + payload).digest("base64url");
  return payload + "." + signature;
}

function readOAuthState(secret, token, now) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", String(secret || "")).update("channel-oauth." + parts[0]).digest("base64url");
  if (!safeEqualText(parts[1], expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (![1, 2].includes(payload.v) || !payload.exp || payload.exp < Number(now || Date.now())) return null;
    payload.tenant_id = cleanTenantId(payload.tenant_id);
    payload.channel = cleanChannel(payload.channel);
    payload.redirect_uri = cleanText(payload.redirect_uri, 500);
    payload.return_mode = payload.return_mode === "popup" ? "popup" : "";
    payload.whatsapp_onboarding_mode = payload.channel === "whatsapp"
      ? cleanWhatsAppOnboardingMode(payload.whatsapp_onboarding_mode)
      : "";
    payload.whatsapp_attempt_id = payload.channel === "whatsapp"
      ? cleanText(payload.whatsapp_attempt_id, 100)
      : "";
    if (!payload.tenant_id || !payload.channel || !payload.nonce || !payload.actor_id) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

class InMemoryChannelConnectionStore {
  constructor() {
    this.rows = [];
    this.audit = [];
    this.whatsappRegistrationLedger = [];
    this.supportsAtomicWhatsAppRegistration = true;
  }

  async listTenant(tenantId) {
    const cleanTenant = cleanTenantId(tenantId);
    return this.rows.filter(function (row) { return row.tenant_id === cleanTenant; }).map(function (row) {
      return Object.assign({}, row, { pending_assets: (row.pending_assets || []).map(function (asset) { return Object.assign({}, asset); }) });
    });
  }

  async listAll() {
    return this.rows.map(function (row) {
      return Object.assign({}, row, { pending_assets: (row.pending_assets || []).map(function (asset) { return Object.assign({}, asset); }) });
    });
  }

  async get(tenantId, channel) {
    const row = this.rows.find(function (item) {
      return item.tenant_id === cleanTenantId(tenantId) && item.channel === cleanChannel(channel);
    });
    return row ? Object.assign({}, row, { pending_assets: (row.pending_assets || []).map(function (asset) { return Object.assign({}, asset); }) }) : null;
  }

  async upsert(input, event) {
    const tenantId = cleanTenantId(input && input.tenant_id);
    const channel = cleanChannel(input && input.channel);
    let row = this.rows.find(function (item) { return item.tenant_id === tenantId && item.channel === channel; });
    if (!row) {
      row = emptyConnection(tenantId, channel);
      this.rows.push(row);
    }
    Object.assign(row, input, {
      tenant_id: tenantId,
      channel,
      updated_at: input.updated_at || new Date().toISOString()
    });
    if (event) {
      this.audit.push({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        channel,
        action: event.action,
        actor: event.actor,
        details: event.details || {},
        created_at: new Date().toISOString()
      });
    }
    return this.get(tenantId, channel);
  }

  async bindWhatsAppAttemptAsset(tenantId, attemptId, fields, event) {
    const cleanTenant = cleanTenantId(tenantId);
    const cleanAttempt = cleanText(attemptId, 100);
    const row = this.rows.find(function (item) {
      return item.tenant_id === cleanTenant && item.channel === "whatsapp";
    });
    if (!row || row.onboarding_attempt_id !== cleanAttempt ||
        !whatsappAttemptRecordIsActive(row) || row.onboarding_attempt_registration_requested_at) {
      return { bound: false, row: row ? await this.get(cleanTenant, "whatsapp") : null };
    }
    const phone = cleanText(fields && fields.onboarding_attempt_phone_number_id, 240);
    const waba = cleanText(fields && fields.onboarding_attempt_waba_id, 240);
    const existingPhone = cleanText(row.onboarding_attempt_phone_number_id, 240);
    const existingWaba = cleanText(row.onboarding_attempt_waba_id, 240);
    if (existingPhone || existingWaba) {
      if (existingPhone === phone && existingWaba === waba) {
        return { bound: true, existing: true, row: await this.get(cleanTenant, "whatsapp") };
      }
      throw new ChannelConnectionError(
        "whatsapp_attempt_asset_mismatch",
        409,
        "A different phone or WABA was returned for the same onboarding attempt"
      );
    }
    const conflict = this.rows.find(function (other) {
      if (!other || other === row || other.channel !== "whatsapp" || other.tenant_id === cleanTenant) return false;
      const otherActive = ["connecting", "connected", "needs_attention"].includes(other.status) ||
        whatsappAttemptRecordIsActive(other);
      if (!otherActive) return false;
      return phone && phone === cleanText(other.onboarding_attempt_phone_number_id || other.phone_number_id, 240) ||
        waba && waba === cleanText(other.onboarding_attempt_waba_id || other.whatsapp_business_account_id, 240);
    });
    if (conflict) {
      throw new ChannelConnectionError("channel_asset_already_assigned", 409);
    }
    Object.assign(row, fields || {}, { updated_at: fields && fields.updated_at || new Date().toISOString() });
    if (event) {
      this.audit.push({
        id: crypto.randomUUID(),
        tenant_id: cleanTenant,
        channel: "whatsapp",
        action: event.action,
        actor: event.actor,
        details: event.details || {},
        created_at: new Date().toISOString()
      });
    }
    return { bound: true, existing: false, row: await this.get(cleanTenant, "whatsapp") };
  }

  async claimWhatsAppRegistration(tenantId, attemptId, fields, event) {
    const cleanTenant = cleanTenantId(tenantId);
    const cleanAttempt = cleanText(attemptId, 100);
    const row = this.rows.find(function (item) {
      return item.tenant_id === cleanTenant && item.channel === "whatsapp";
    });
    if (!row || row.onboarding_attempt_id !== cleanAttempt ||
        !whatsappAttemptRecordIsActive(row) ||
        ["registration_rejected", "reconciliation_exhausted"].includes(
          cleanText(row.onboarding_attempt_status, 80).toLowerCase()
        ) ||
        row.onboarding_attempt_registration_requested_at) {
      return { claimed: false, row: row ? await this.get(cleanTenant, "whatsapp") : null };
    }
    const phoneNumberId = cleanText(fields && fields.whatsapp_last_registration_phone_number_id, 240);
    if (!phoneNumberId || phoneNumberId !== cleanText(row.onboarding_attempt_phone_number_id, 240)) {
      throw new ChannelConnectionError("whatsapp_attempt_asset_mismatch", 409);
    }
    const requestedAt = new Date(fields && fields.onboarding_attempt_registration_requested_at || Date.now());
    const priorClaim = this.whatsappRegistrationLedger.find(function (claim) {
      const priorAt = new Date(claim.requested_at).getTime();
      return phoneNumberId && claim.phone_number_id === phoneNumberId &&
        Number.isFinite(priorAt) && requestedAt.getTime() - priorAt < WHATSAPP_REGISTRATION_COOLDOWN_MS;
    });
    if (priorClaim) {
      throw new ChannelConnectionError(
        "whatsapp_activation_rate_limited",
        429,
        "This phone already has a registration claim during the 72-hour safety window"
      );
    }
    Object.assign(row, fields || {}, { updated_at: fields && fields.updated_at || new Date().toISOString() });
    this.whatsappRegistrationLedger.push({
      attempt_id: cleanAttempt,
      tenant_id: cleanTenant,
      phone_number_id: phoneNumberId,
      waba_id: cleanText(row.onboarding_attempt_waba_id, 240),
      requested_at: requestedAt.toISOString()
    });
    if (event) {
      this.audit.push({
        id: crypto.randomUUID(),
        tenant_id: cleanTenant,
        channel: "whatsapp",
        action: event.action,
        actor: event.actor,
        details: event.details || {},
        created_at: new Date().toISOString()
      });
    }
    return { claimed: true, row: await this.get(cleanTenant, "whatsapp") };
  }

  async claimWhatsAppReconciliation(tenantId, attemptId, owner, referenceTime) {
    const cleanTenant = cleanTenantId(tenantId);
    const cleanAttempt = cleanText(attemptId, 100);
    const cleanOwner = cleanText(owner, 200) || "system:whatsapp-reconciler";
    const currentTime = new Date(referenceTime || Date.now());
    const currentMs = currentTime.getTime();
    const row = this.rows.find(function (item) {
      return item.tenant_id === cleanTenant && item.channel === "whatsapp";
    });
    const stage = cleanText(row && row.onboarding_attempt_status, 80).toLowerCase();
    const startedMs = new Date(row && row.onboarding_attempt_started_at || 0).getTime();
    const leaseMs = new Date(row && row.onboarding_attempt_reconcile_lease_until || 0).getTime();
    const nextMs = new Date(row && row.onboarding_attempt_reconcile_after || 0).getTime();
    const count = Math.max(0, Number(row && row.onboarding_attempt_reconcile_count) || 0);
    const attemptMatches = row && row.onboarding_attempt_id === cleanAttempt &&
      whatsappAttemptRecordIsActive(row) &&
      !!row.onboarding_attempt_registration_requested_at &&
      !!row.onboarding_attempt_ciphertext &&
      !["registration_rejected", "reconciliation_exhausted", "completed", "cancelled"].includes(stage);
    const exhausted = attemptMatches && (
      Number.isFinite(startedMs) && startedMs > 0 && currentMs - startedMs >= WHATSAPP_REGISTRATION_COOLDOWN_MS ||
      count >= 48
    );
    if (exhausted) {
      Object.assign(row, {
        status: "needs_attention",
        webhook_status: "needs_attention",
        onboarding_attempt_status: "reconciliation_exhausted",
        onboarding_attempt_last_error: "WhatsApp reconciliation window exhausted",
        onboarding_attempt_last_error_at: currentTime.toISOString(),
        onboarding_attempt_reconcile_lease_until: null,
        onboarding_attempt_reconcile_owner: null,
        onboarding_attempt_updated_at: currentTime.toISOString(),
        updated_at: currentTime.toISOString()
      });
      return { claimed: false, row: await this.get(cleanTenant, "whatsapp") };
    }
    const eligible = attemptMatches && count < 48 &&
      (!Number.isFinite(leaseMs) || leaseMs <= currentMs) &&
      (!Number.isFinite(nextMs) || nextMs <= currentMs);
    if (!eligible) {
      return { claimed: false, row: row ? await this.get(cleanTenant, "whatsapp") : null };
    }
    const nextCount = count + 1;
    const delayMs = nextCount <= 4 ? 30 * 1000
      : nextCount <= 12 ? 5 * 60 * 1000
      : nextCount <= 24 ? 30 * 60 * 1000
      : nextCount <= 36 ? 2 * 60 * 60 * 1000
      : 6 * 60 * 60 * 1000;
    Object.assign(row, {
      onboarding_attempt_reconcile_count: nextCount,
      onboarding_attempt_reconcile_after: new Date(currentMs + delayMs).toISOString(),
      onboarding_attempt_reconcile_lease_until: new Date(currentMs + 2 * 60 * 1000).toISOString(),
      onboarding_attempt_reconcile_owner: cleanOwner,
      onboarding_attempt_updated_at: currentTime.toISOString(),
      updated_at: currentTime.toISOString()
    });
    return { claimed: true, row: await this.get(cleanTenant, "whatsapp") };
  }

  async releaseWhatsAppReconciliation(tenantId, attemptId, owner) {
    const cleanTenant = cleanTenantId(tenantId);
    const cleanAttempt = cleanText(attemptId, 100);
    const cleanOwner = cleanText(owner, 200);
    const row = this.rows.find(function (item) {
      return item.tenant_id === cleanTenant && item.channel === "whatsapp";
    });
    if (!row || row.onboarding_attempt_id !== cleanAttempt ||
        cleanText(row.onboarding_attempt_reconcile_owner, 200) !== cleanOwner) {
      return { released: false, row: row ? await this.get(cleanTenant, "whatsapp") : null };
    }
    row.onboarding_attempt_reconcile_lease_until = null;
    row.onboarding_attempt_reconcile_owner = null;
    row.updated_at = new Date().toISOString();
    return { released: true, row: await this.get(cleanTenant, "whatsapp") };
  }

  async updateWhatsAppAttempt(tenantId, attemptId, fields, event) {
    const cleanTenant = cleanTenantId(tenantId);
    const cleanAttempt = cleanText(attemptId, 100);
    const row = this.rows.find(function (item) {
      return item.tenant_id === cleanTenant && item.channel === "whatsapp";
    });
    if (!row || row.onboarding_attempt_id !== cleanAttempt || !whatsappAttemptRecordIsActive(row) ||
        ["registration_rejected", "reconciliation_exhausted"].includes(
          cleanText(row.onboarding_attempt_status, 80).toLowerCase()
        )) {
      return { updated: false, row: row ? await this.get(cleanTenant, "whatsapp") : null };
    }
    const next = Object.assign({}, row, fields || {});
    const claimedPhone = cleanText(next.onboarding_attempt_phone_number_id || next.phone_number_id, 240);
    const claimedWaba = cleanText(next.onboarding_attempt_waba_id || next.whatsapp_business_account_id, 240);
    const conflict = this.rows.find(function (other) {
      if (!other || other === row || other.channel !== "whatsapp" || other.tenant_id === cleanTenant) return false;
      const otherActive = ["connecting", "connected", "needs_attention"].includes(other.status) ||
        whatsappAttemptRecordIsActive(other);
      if (!otherActive) return false;
      const otherPhone = cleanText(other.onboarding_attempt_phone_number_id || other.phone_number_id, 240);
      const otherWaba = cleanText(other.onboarding_attempt_waba_id || other.whatsapp_business_account_id, 240);
      return !!(claimedPhone && claimedPhone === otherPhone || claimedWaba && claimedWaba === otherWaba);
    });
    if (conflict) {
      throw new ChannelConnectionError(
        "channel_asset_already_assigned",
        409,
        "WhatsApp asset is already assigned to tenant " + conflict.tenant_id
      );
    }
    Object.assign(row, fields || {}, { updated_at: fields && fields.updated_at || new Date().toISOString() });
    if (event) {
      this.audit.push({
        id: crypto.randomUUID(),
        tenant_id: cleanTenant,
        channel: "whatsapp",
        action: event.action,
        actor: event.actor,
        details: event.details || {},
        created_at: new Date().toISOString()
      });
    }
    return { updated: true, row: await this.get(cleanTenant, "whatsapp") };
  }

  async cancelWhatsAppAttempt(tenantId, attemptId, fields, event) {
    const cleanTenant = cleanTenantId(tenantId);
    const cleanAttempt = cleanText(attemptId, 100);
    const row = this.rows.find(function (item) {
      return item.tenant_id === cleanTenant && item.channel === "whatsapp";
    });
    const cancellable = row && row.onboarding_attempt_id === cleanAttempt &&
      whatsappAttemptRecordIsActive(row) && (
        !row.onboarding_attempt_registration_requested_at ||
        ["registration_rejected", "reconciliation_exhausted"].includes(
          cleanText(row.onboarding_attempt_status, 80).toLowerCase()
        )
      );
    if (!cancellable) {
      return { cancelled: false, row: row ? await this.get(cleanTenant, "whatsapp") : null };
    }
    Object.assign(row, fields || {}, { updated_at: fields && fields.updated_at || new Date().toISOString() });
    if (event) {
      this.audit.push({
        id: crypto.randomUUID(),
        tenant_id: cleanTenant,
        channel: "whatsapp",
        action: event.action,
        actor: event.actor,
        details: event.details || {},
        created_at: new Date().toISOString()
      });
    }
    return { cancelled: true, row: await this.get(cleanTenant, "whatsapp") };
  }
}

class AppendOnlyChannelConnectionStore {
  constructor(options) {
    options = options || {};
    this.loadLatest = options.loadLatest;
    this.loadAll = options.loadAll;
    this.loadAllStrict = options.loadAllStrict;
    this.append = options.append;
    this.supportsAtomicWhatsAppRegistration = false;
    if (typeof this.loadLatest !== "function" || typeof this.loadAll !== "function" || typeof this.append !== "function") {
      throw new Error("append_only_channel_store_callbacks_required");
    }
  }

  recordId(tenantId, channel) {
    return "channel-connection:" + cleanTenantId(tenantId) + ":" + cleanChannel(channel);
  }

  async listTenant(tenantId) {
    const cleanTenant = cleanTenantId(tenantId);
    const rows = await Promise.all(SUPPORTED_CHANNELS.map((channel) => this.get(cleanTenant, channel)));
    return rows.filter(Boolean);
  }

  async listAll() {
    const rows = await this.loadAll();
    return this.latestRows(rows);
  }

  async listAllStrictForCutover() {
    if (typeof this.loadAllStrict !== "function") {
      throw new ChannelConnectionError("channel_store_unavailable", 503, "Strict cutover scan is unavailable");
    }
    const rows = await this.loadAllStrict();
    return this.latestRows(rows);
  }

  latestRows(rows) {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : [])
      .filter(function (row) {
        const tenantId = cleanTenantId(row && row.tenant_id);
        const channel = cleanChannel(row && row.channel);
        const key = tenantId + ":" + channel;
        if (!tenantId || !channel || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(function (row) {
        return Object.assign(emptyConnection(row.tenant_id, row.channel), row, {
          tenant_id: cleanTenantId(row.tenant_id),
          channel: cleanChannel(row.channel)
        });
      });
  }

  async get(tenantId, channel) {
    const cleanTenant = cleanTenantId(tenantId);
    const clean = cleanChannel(channel);
    if (!cleanTenant || !clean) return null;
    const row = await this.loadLatest(this.recordId(cleanTenant, clean), cleanTenant, clean);
    if (!row) return null;
    return Object.assign(emptyConnection(cleanTenant, clean), row, {
      tenant_id: cleanTenant,
      channel: clean
    });
  }

  async upsert(input, event) {
    const tenantId = cleanTenantId(input && input.tenant_id);
    const channel = cleanChannel(input && input.channel);
    if (!tenantId || !channel) throw new ChannelConnectionError("invalid_channel_request", 400);
    const current = await this.get(tenantId, channel);
    const row = Object.assign(emptyConnection(tenantId, channel), current || {}, input || {}, {
      tenant_id: tenantId,
      channel,
      updated_at: input && input.updated_at || new Date().toISOString()
    });
    await this.append(this.recordId(tenantId, channel), row, event || null);
    return row;
  }
}

class SupabaseChannelConnectionStore {
  constructor(options) {
    this.url = String(options && options.url || "").replace(/\/$/, "");
    this.headers = Object.assign({}, options && options.headers || {});
    this.axios = options && options.axiosClient;
    this.supportsAtomicWhatsAppRegistration = true;
  }

  async listTenant(tenantId) {
    try {
      const response = await this.axios.get(this.url + "/rest/v1/tenant_channel_connections", {
        params: { select: "*", tenant_id: "eq." + cleanTenantId(tenantId), order: "channel.asc" },
        headers: this.headers,
        timeout: 8000
      });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async listAll() {
    try {
      const rows = [];
      const pageSize = 1000;
      for (let page = 0; page < 100; page++) {
        const response = await this.axios.get(this.url + "/rest/v1/tenant_channel_connections", {
          params: {
            select: "*",
            order: "tenant_id.asc,channel.asc",
            limit: pageSize,
            offset: page * pageSize
          },
          headers: this.headers,
          timeout: 8000
        });
        if (!Array.isArray(response.data)) {
          throw new ChannelConnectionError("channel_store_unavailable", 503, "Invalid channel-store page");
        }
        rows.push(...response.data);
        if (response.data.length < pageSize) return rows;
      }
      throw new ChannelConnectionError("channel_store_unavailable", 503, "Channel-store scan was truncated");
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async get(tenantId, channel) {
    try {
      const response = await this.axios.get(this.url + "/rest/v1/tenant_channel_connections", {
        params: {
          select: "*",
          tenant_id: "eq." + cleanTenantId(tenantId),
          channel: "eq." + cleanChannel(channel),
          limit: 1
        },
        headers: this.headers,
        timeout: 8000
      });
      return Array.isArray(response.data) ? response.data[0] || null : null;
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async upsert(input, event) {
    const payload = Object.assign({}, input, {
      tenant_id: cleanTenantId(input && input.tenant_id),
      channel: cleanChannel(input && input.channel),
      updated_at: input.updated_at || new Date().toISOString()
    });
    try {
      const response = await this.axios.post(
        this.url + "/rest/v1/tenant_channel_connections?on_conflict=tenant_id,channel",
        payload,
        {
          headers: Object.assign({ Prefer: "resolution=merge-duplicates,return=representation" }, this.headers),
          timeout: 8000
        }
      );
      const row = Array.isArray(response.data) ? response.data[0] : response.data;
      if (event) await this.writeAudit(payload.tenant_id, payload.channel, event);
      return row;
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async bindWhatsAppAttemptAsset(tenantId, attemptId, fields, event) {
    const cleanTenant = cleanTenantId(tenantId);
    const cleanAttempt = cleanText(attemptId, 100);
    const phone = cleanText(fields && fields.onboarding_attempt_phone_number_id, 240);
    const waba = cleanText(fields && fields.onboarding_attempt_waba_id, 240);
    const payload = Object.assign({}, fields || {});
    delete payload.tenant_id;
    delete payload.channel;
    try {
      const response = await this.axios.patch(
        this.url + "/rest/v1/tenant_channel_connections",
        payload,
        {
          params: {
            tenant_id: "eq." + cleanTenant,
            channel: "eq.whatsapp",
            onboarding_attempt_id: "eq." + cleanAttempt,
            onboarding_attempt_status: "not.in.(completed,cancelled)",
            onboarding_attempt_registration_requested_at: "is.null",
            onboarding_attempt_phone_number_id: "is.null",
            onboarding_attempt_waba_id: "is.null"
          },
          headers: Object.assign({ Prefer: "return=representation" }, this.headers),
          timeout: 8000
        }
      );
      const rows = Array.isArray(response.data) ? response.data : [];
      if (rows.length) {
        if (event) await this.writeAudit(cleanTenant, "whatsapp", event);
        return { bound: true, existing: false, row: rows[0] };
      }
      const current = await this.get(cleanTenant, "whatsapp");
      if (current && current.onboarding_attempt_id === cleanAttempt &&
          whatsappAttemptRecordIsActive(current) &&
          cleanText(current.onboarding_attempt_phone_number_id, 240) === phone &&
          cleanText(current.onboarding_attempt_waba_id, 240) === waba) {
        return { bound: true, existing: true, row: current };
      }
      if (current && current.onboarding_attempt_id === cleanAttempt &&
          (current.onboarding_attempt_phone_number_id || current.onboarding_attempt_waba_id)) {
        throw new ChannelConnectionError(
          "whatsapp_attempt_asset_mismatch",
          409,
          "A different phone or WABA was returned for the same onboarding attempt"
        );
      }
      return { bound: false, row: current };
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async claimWhatsAppRegistration(tenantId, attemptId, fields, event) {
    const cleanTenant = cleanTenantId(tenantId);
    const cleanAttempt = cleanText(attemptId, 100);
    try {
      const response = await this.axios.post(
        this.url + "/rest/v1/rpc/claim_whatsapp_registration_v2",
        {
          p_tenant_id: cleanTenant,
          p_attempt_id: cleanAttempt,
          p_phone_number_id: cleanText(fields && fields.whatsapp_last_registration_phone_number_id, 240),
          p_attempt_ciphertext: cleanText(fields && fields.onboarding_attempt_ciphertext, 12000),
          p_actor: cleanText(event && event.actor, 200)
        },
        {
          headers: Object.assign({ Prefer: "return=representation" }, this.headers),
          timeout: 8000
        }
      );
      const rows = Array.isArray(response.data) ? response.data : [];
      if (!rows.length) return { claimed: false, row: await this.get(cleanTenant, "whatsapp") };
      return { claimed: true, row: rows[0] };
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async claimWhatsAppReconciliation(tenantId, attemptId, owner) {
    const cleanTenant = cleanTenantId(tenantId);
    const cleanAttempt = cleanText(attemptId, 100);
    try {
      const response = await this.axios.post(
        this.url + "/rest/v1/rpc/claim_whatsapp_reconciliation_v2",
        {
          p_tenant_id: cleanTenant,
          p_attempt_id: cleanAttempt,
          p_owner: cleanText(owner, 200) || "system:whatsapp-reconciler"
        },
        {
          headers: Object.assign({ Prefer: "return=representation" }, this.headers),
          timeout: 8000
        }
      );
      const rows = Array.isArray(response.data) ? response.data : [];
      if (!rows.length) return { claimed: false, row: await this.get(cleanTenant, "whatsapp") };
      return { claimed: true, row: rows[0] };
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async releaseWhatsAppReconciliation(tenantId, attemptId, owner) {
    const cleanTenant = cleanTenantId(tenantId);
    const cleanAttempt = cleanText(attemptId, 100);
    const cleanOwner = cleanText(owner, 200);
    try {
      const response = await this.axios.patch(
        this.url + "/rest/v1/tenant_channel_connections",
        {
          onboarding_attempt_reconcile_lease_until: null,
          onboarding_attempt_reconcile_owner: null,
          updated_at: new Date().toISOString()
        },
        {
          params: {
            tenant_id: "eq." + cleanTenant,
            channel: "eq.whatsapp",
            onboarding_attempt_id: "eq." + cleanAttempt,
            onboarding_attempt_reconcile_owner: "eq." + cleanOwner
          },
          headers: Object.assign({ Prefer: "return=representation" }, this.headers),
          timeout: 8000
        }
      );
      const rows = Array.isArray(response.data) ? response.data : [];
      if (!rows.length) return { released: false, row: await this.get(cleanTenant, "whatsapp") };
      return { released: true, row: rows[0] };
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async updateWhatsAppAttempt(tenantId, attemptId, fields, event) {
    const cleanTenant = cleanTenantId(tenantId);
    const cleanAttempt = cleanText(attemptId, 100);
    const payload = Object.assign({}, fields || {});
    delete payload.tenant_id;
    delete payload.channel;
    try {
      const response = await this.axios.patch(
        this.url + "/rest/v1/tenant_channel_connections",
        payload,
        {
          params: {
            tenant_id: "eq." + cleanTenant,
            channel: "eq.whatsapp",
            onboarding_attempt_id: "eq." + cleanAttempt,
            onboarding_attempt_status: "not.in.(completed,cancelled,registration_rejected,reconciliation_exhausted)"
          },
          headers: Object.assign({ Prefer: "return=representation" }, this.headers),
          timeout: 8000
        }
      );
      const rows = Array.isArray(response.data) ? response.data : [];
      if (!rows.length) return { updated: false, row: await this.get(cleanTenant, "whatsapp") };
      if (event) await this.writeAudit(cleanTenant, "whatsapp", event);
      return { updated: true, row: rows[0] };
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async cancelWhatsAppAttempt(tenantId, attemptId, fields, event) {
    const cleanTenant = cleanTenantId(tenantId);
    const cleanAttempt = cleanText(attemptId, 100);
    const payload = Object.assign({}, fields || {});
    delete payload.tenant_id;
    delete payload.channel;
    try {
      const response = await this.axios.patch(
        this.url + "/rest/v1/tenant_channel_connections",
        payload,
        {
          params: {
            tenant_id: "eq." + cleanTenant,
            channel: "eq.whatsapp",
            onboarding_attempt_id: "eq." + cleanAttempt,
            onboarding_attempt_status: "not.in.(completed,cancelled)",
            or: "(onboarding_attempt_registration_requested_at.is.null,onboarding_attempt_status.eq.registration_rejected,onboarding_attempt_status.eq.reconciliation_exhausted)"
          },
          headers: Object.assign({ Prefer: "return=representation" }, this.headers),
          timeout: 8000
        }
      );
      const rows = Array.isArray(response.data) ? response.data : [];
      if (!rows.length) return { cancelled: false, row: await this.get(cleanTenant, "whatsapp") };
      if (event) await this.writeAudit(cleanTenant, "whatsapp", event);
      return { cancelled: true, row: rows[0] };
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async writeAudit(tenantId, channel, event) {
    try {
      await this.axios.post(this.url + "/rest/v1/tenant_channel_connection_audit", {
        tenant_id: cleanTenantId(tenantId),
        channel: cleanChannel(channel),
        action: cleanText(event && event.action, 80),
        actor: cleanText(event && event.actor, 200),
        details: event && event.details || {}
      }, {
        headers: Object.assign({ Prefer: "return=minimal" }, this.headers),
        timeout: 8000
      });
    } catch (_) {
      // The state transition is authoritative. Audit persistence is best effort
      // so a transient audit-table problem cannot trigger a duplicate side effect.
    }
  }
}

function activeWhatsAppOwnership(row) {
  if (!row || cleanChannel(row.channel) !== "whatsapp") return null;
  const active = ["connecting", "connected", "needs_attention"].includes(row.status) ||
    whatsappAttemptRecordIsActive(row);
  if (!active) return null;
  const tenantId = cleanTenantId(row.tenant_id);
  const phone = cleanText(row.onboarding_attempt_phone_number_id || row.phone_number_id, 240);
  const waba = cleanText(row.onboarding_attempt_waba_id || row.whatsapp_business_account_id, 240);
  if (!tenantId || !phone && !waba) return null;
  return { tenant_id: tenantId, phone_number_id: phone, waba_id: waba };
}

function assertHistoricalWhatsAppOwnership(primaryRows, fallbackRows) {
  const primaryByTenantChannel = new Map((Array.isArray(primaryRows) ? primaryRows : []).map(function (row) {
    return [cleanTenantId(row && row.tenant_id) + ":" + cleanChannel(row && row.channel), row];
  }));
  const fallbackByTenantChannel = new Map((Array.isArray(fallbackRows) ? fallbackRows : []).map(function (row) {
    return [cleanTenantId(row && row.tenant_id) + ":" + cleanChannel(row && row.channel), row];
  }));
  const resolvedRows = [];
  for (const key of new Set(Array.from(primaryByTenantChannel.keys()).concat(Array.from(fallbackByTenantChannel.keys())))) {
    const primary = primaryByTenantChannel.get(key);
    const fallback = fallbackByTenantChannel.get(key);
    if (!primary || !fallback) {
      resolvedRows.push(primary || fallback);
      continue;
    }
    const primaryAt = Date.parse(primary.updated_at || "");
    const fallbackAt = Date.parse(fallback.updated_at || "");
    if (Number.isFinite(primaryAt) && Number.isFinite(fallbackAt) && primaryAt !== fallbackAt) {
      // A tenant may legitimately replace phone A with phone B. Only its most
      // recent state is an ownership claim; the older append-only row is not a
      // second owner merely because both rows say connected.
      resolvedRows.push(primaryAt > fallbackAt ? primary : fallback);
    } else {
      // Equal or invalid timestamps cannot prove which identity superseded the
      // other. Keep both so a differing identity fails closed below.
      resolvedRows.push(primary, fallback);
    }
  }
  const ownersByAsset = new Map();
  const identitiesByTenant = new Map();
  for (const row of resolvedRows) {
      const identity = activeWhatsAppOwnership(row);
      if (!identity) continue;
      const tenantKey = identity.tenant_id + ":whatsapp";
      const identityKey = (identity.phone_number_id || "-") + ":" + (identity.waba_id || "-");
      if (!identitiesByTenant.has(tenantKey)) identitiesByTenant.set(tenantKey, new Set());
      identitiesByTenant.get(tenantKey).add(identityKey);
      for (const assetKey of [
        identity.phone_number_id ? "phone:" + identity.phone_number_id : "",
        identity.waba_id ? "waba:" + identity.waba_id : ""
      ].filter(Boolean)) {
        if (!ownersByAsset.has(assetKey)) ownersByAsset.set(assetKey, new Set());
        ownersByAsset.get(assetKey).add(identity.tenant_id);
      }
  }
  const conflictingTenant = Array.from(identitiesByTenant.entries()).find(function (entry) {
    return entry[1].size > 1;
  });
  const conflictingAsset = Array.from(ownersByAsset.entries()).find(function (entry) {
    return entry[1].size > 1;
  });
  if (conflictingTenant || conflictingAsset) {
    throw new ChannelConnectionError(
      "channel_store_unavailable",
      503,
      conflictingAsset
        ? "Historical WhatsApp asset has multiple tenant owners: " + conflictingAsset[0]
        : "Historical WhatsApp tenant has conflicting primary and fallback identities: " + conflictingTenant[0]
    );
  }
  return { ok: true };
}

class MigratingChannelConnectionStore {
  constructor(options) {
    options = options || {};
    this.primary = options.primary;
    this.fallback = options.fallback;
    this.supportsAtomicWhatsAppRegistration = !!(
      this.primary && this.primary.supportsAtomicWhatsAppRegistration
    );
    // Once the historical cutover succeeds, the dedicated store remains the
    // only runtime authority. A later preflight failure may pause new
    // onboardings, but it must never reintroduce legacy rows into routing.
    this.primaryAuthoritative = false;
    this.whatsappOnboardingReady = false;
    this.whatsappPreparationPromise = null;
    if (!this.primary || !this.fallback) throw new Error("migrating_channel_store_requires_both_stores");
  }

  async assertWhatsAppOnboardingReady(options) {
    const force = options && options.force === true;
    if (this.whatsappOnboardingReady && !force) return { ok: true, backfilled: 0 };
    if (this.whatsappPreparationPromise) return this.whatsappPreparationPromise;
    const self = this;
    const preparation = (async function () {
      const primaryRows = await self.primary.listAll();
      const fallbackRows = typeof self.fallback.listAllStrictForCutover === "function"
        ? await self.fallback.listAllStrictForCutover()
        : await self.fallback.listAll();
      assertHistoricalWhatsAppOwnership(primaryRows, fallbackRows);
      const primaryByKey = new Map((primaryRows || []).map(function (row) {
        return [cleanTenantId(row && row.tenant_id) + ":" + cleanChannel(row && row.channel), row];
      }));
      let backfilled = 0;
      for (const row of fallbackRows || []) {
        const tenantId = cleanTenantId(row && row.tenant_id);
        const channel = cleanChannel(row && row.channel);
        const key = tenantId + ":" + channel;
        if (!tenantId || !channel) continue;
        const primaryPeer = primaryByKey.get(key);
        const primaryAt = Date.parse(primaryPeer && primaryPeer.updated_at || "");
        const fallbackAt = Date.parse(row && row.updated_at || "");
        const fallbackIsNewer = !primaryPeer ||
          Number.isFinite(fallbackAt) && (!Number.isFinite(primaryAt) || fallbackAt > primaryAt);
        if (!fallbackIsNewer) continue;
        await self.primary.upsert(Object.assign(emptyConnection(tenantId, channel), row, {
          tenant_id: tenantId,
          channel
        }), null);
        primaryByKey.set(key, row);
        backfilled++;
      }
      const refreshedPrimaryRows = await self.primary.listAll();
      assertHistoricalWhatsAppOwnership(refreshedPrimaryRows, fallbackRows);
      self.primaryAuthoritative = true;
      self.whatsappOnboardingReady = true;
      return { ok: true, backfilled };
    })();
    this.whatsappPreparationPromise = preparation;
    try {
      return await preparation;
    } catch (error) {
      self.whatsappOnboardingReady = false;
      throw mapStoreError(error);
    } finally {
      if (self.whatsappPreparationPromise === preparation) self.whatsappPreparationPromise = null;
    }
  }

  async get(tenantId, channel) {
    if (this.primaryAuthoritative) return this.primary.get(tenantId, channel);
    const primary = await this.primary.get(tenantId, channel);
    return primary || this.fallback.get(tenantId, channel);
  }

  async listTenant(tenantId) {
    if (this.primaryAuthoritative) return this.primary.listTenant(tenantId);
    const rows = new Map();
    for (const row of await this.fallback.listTenant(tenantId)) rows.set(cleanChannel(row.channel), row);
    for (const row of await this.primary.listTenant(tenantId)) rows.set(cleanChannel(row.channel), row);
    return Array.from(rows.values());
  }

  async listAll() {
    if (this.primaryAuthoritative) return this.primary.listAll();
    const rows = new Map();
    for (const row of await this.fallback.listAll()) {
      rows.set(cleanTenantId(row.tenant_id) + ":" + cleanChannel(row.channel), row);
    }
    for (const row of await this.primary.listAll()) {
      rows.set(cleanTenantId(row.tenant_id) + ":" + cleanChannel(row.channel), row);
    }
    return Array.from(rows.values());
  }

  async upsert(input, event) {
    const current = await this.get(input && input.tenant_id, input && input.channel);
    return this.primary.upsert(Object.assign({}, current || {}, input || {}), event);
  }

  async bindWhatsAppAttemptAsset(tenantId, attemptId, fields, event) {
    return this.primary.bindWhatsAppAttemptAsset(tenantId, attemptId, fields, event);
  }

  async claimWhatsAppRegistration(tenantId, attemptId, fields, event) {
    return this.primary.claimWhatsAppRegistration(tenantId, attemptId, fields, event);
  }

  async claimWhatsAppReconciliation(tenantId, attemptId, owner) {
    return this.primary.claimWhatsAppReconciliation(tenantId, attemptId, owner);
  }

  async releaseWhatsAppReconciliation(tenantId, attemptId, owner) {
    return this.primary.releaseWhatsAppReconciliation(tenantId, attemptId, owner);
  }

  async updateWhatsAppAttempt(tenantId, attemptId, fields, event) {
    return this.primary.updateWhatsAppAttempt(tenantId, attemptId, fields, event);
  }

  async cancelWhatsAppAttempt(tenantId, attemptId, fields, event) {
    return this.primary.cancelWhatsAppAttempt(tenantId, attemptId, fields, event);
  }
}

class MetaChannelProvider {
  constructor(options) {
    options = options || {};
    this.appId = cleanText(options.appId, 160);
    this.appSecret = cleanText(options.appSecret, 400);
    this.whatsappConfigId = cleanText(options.whatsappConfigId, 240);
    this.graphVersion = cleanText(options.graphVersion, 20) || "v26.0";
    this.graphOrigin = String(options.graphOrigin || "https://graph.facebook.com").replace(/\/$/, "");
    this.dialogOrigin = String(options.dialogOrigin || "https://www.facebook.com").replace(/\/$/, "");
    this.redirectUri = cleanText(options.redirectUri, 500);
    this.instagramAppId = cleanText(options.instagramAppId, 160);
    this.instagramAppSecret = cleanText(options.instagramAppSecret, 400);
    this.instagramLoginEnabled = options.instagramLoginEnabled === true;
    this.instagramDialogOrigin = String(options.instagramDialogOrigin || "https://www.instagram.com").replace(/\/$/, "");
    this.instagramApiOrigin = String(options.instagramApiOrigin || "https://api.instagram.com").replace(/\/$/, "");
    this.instagramGraphOrigin = String(options.instagramGraphOrigin || "https://graph.instagram.com").replace(/\/$/, "");
    this.axios = options.axiosClient;
    this.logger = typeof options.logger === "function" ? options.logger : function () {};
  }

  configured(channel) {
    if (channel === "instagram" && this.instagramLoginEnabled) {
      return !!(this.instagramAppId && this.instagramAppSecret && this.redirectUri && this.axios);
    }
    if (!this.appId || !this.appSecret || !this.redirectUri || !this.axios) return false;
    return channel !== "whatsapp" || !!this.whatsappConfigId;
  }

  authorizationUrl(channel, state, options) {
    channel = cleanChannel(channel);
    if (!this.configured(channel)) throw new ChannelConnectionError("channel_oauth_not_configured", 503);
    const redirectUri = cleanText(options && options.redirectUri || this.redirectUri, 500);
    if (!redirectUri) throw new ChannelConnectionError("channel_oauth_not_configured", 503);
    if (channel === "instagram" && this.instagramLoginEnabled) {
      const url = new URL(this.instagramDialogOrigin + "/oauth/authorize");
      url.searchParams.set("enable_fb_login", "0");
      url.searchParams.set("client_id", this.instagramAppId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_messages");
      return url.toString();
    }
    const scopes = {
      whatsapp: ["business_management", "whatsapp_business_management", "whatsapp_business_messaging"],
      instagram: ["business_management", "pages_show_list", "pages_read_engagement", "pages_manage_metadata", "instagram_basic", "instagram_manage_messages"],
      messenger: ["business_management", "pages_show_list", "pages_manage_metadata", "pages_messaging"]
    }[channel];
    const url = new URL(this.dialogOrigin + "/" + this.graphVersion + "/dialog/oauth");
    url.searchParams.set("client_id", this.appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(","));
    url.searchParams.set("auth_type", "rerequest");
    if (channel === "whatsapp") {
      url.searchParams.set("config_id", this.whatsappConfigId);
      url.searchParams.set("override_default_response_type", "true");
    }
    return url.toString();
  }

  graph(path, token, config) {
    const settings = Object.assign({}, config || {});
    settings.headers = Object.assign({}, settings.headers || {}, { Authorization: "Bearer " + token });
    settings.timeout = settings.timeout || 10000;
    return this.axios(Object.assign({
      method: "GET",
      url: this.graphOrigin + "/" + this.graphVersion + "/" + String(path || "").replace(/^\/+/, "")
    }, settings));
  }

  async exchangeCode(code, options) {
    const channel = cleanChannel(options && options.channel);
    const omitRedirectUri = channel === "whatsapp" && options && options.omitRedirectUri === true;
    const redirectUri = cleanText(options && options.redirectUri || this.redirectUri, 500);
    if (!omitRedirectUri && !redirectUri) throw new ChannelConnectionError("channel_oauth_not_configured", 503);
    if (channel === "instagram" && this.instagramLoginEnabled) {
      try {
        const payload = {
          client_id: this.instagramAppId,
          client_secret: this.instagramAppSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code: cleanText(code, 2000)
        };
        const endpoint = this.instagramApiOrigin + "/oauth/access_token";
        const response = typeof this.axios.postForm === "function"
          ? await this.axios.postForm(endpoint, payload, { timeout: 10000 })
          : await this.axios.post(endpoint, new URLSearchParams(payload).toString(), {
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              timeout: 10000
            });
        const responseData = response.data || {};
        const firstResult = Array.isArray(responseData.data) ? responseData.data[0] || {} : {};
        const token = cleanText(responseData.access_token || firstResult.access_token, 4096);
        if (!token) throw new Error("Instagram did not return an access token");
        return { access_token: token, login_type: "instagram" };
      } catch (error) {
        throw new ChannelConnectionError("invalid_authorization", 422, internalError(error));
      }
    }
    try {
      const params = {
        client_id: this.appId,
        client_secret: this.appSecret,
        code: cleanText(code, 2000)
      };
      if (!omitRedirectUri) params.redirect_uri = redirectUri;
      const response = await this.axios.get(this.graphOrigin + "/" + this.graphVersion + "/oauth/access_token", {
        params,
        timeout: 10000
      });
      const token = cleanText(response.data && response.data.access_token, 4096);
      if (!token) throw new Error("Meta did not return an access token");
      return token;
    } catch (error) {
      throw new ChannelConnectionError("invalid_authorization", 422, internalError(error));
    }
  }

  async extendUserAccessToken(accessToken) {
    if (accessToken && accessToken.login_type === "instagram") {
      try {
        const response = await this.axios.get(this.instagramGraphOrigin + "/access_token", {
          params: {
            grant_type: "ig_exchange_token",
            client_secret: this.instagramAppSecret,
            access_token: accessToken.access_token
          },
          timeout: 10000
        });
        return {
          access_token: cleanText(response.data && response.data.access_token, 4096) || accessToken.access_token,
          login_type: "instagram"
        };
      } catch (_) {
        return accessToken;
      }
    }
    try {
      const response = await this.axios.get(this.graphOrigin + "/" + this.graphVersion + "/oauth/access_token", {
        params: {
          grant_type: "fb_exchange_token",
          client_id: this.appId,
          client_secret: this.appSecret,
          fb_exchange_token: cleanText(accessToken, 4096)
        },
        timeout: 10000
      });
      return cleanText(response.data && response.data.access_token, 4096) || accessToken;
    } catch (_) {
      // Some Embedded Signup codes already return a business token that cannot
      // be exchanged with fb_exchange_token. Keep it and verify the asset below.
      return accessToken;
    }
  }

  async discoverInstagramLogin(access) {
    const accessToken = cleanText(access && access.access_token, 4096);
    if (!accessToken) throw new ChannelConnectionError("invalid_authorization", 422);
    const response = await this.axios.get(this.instagramGraphOrigin + "/" + this.graphVersion + "/me", {
      params: { fields: "user_id,username,name" },
      headers: { Authorization: "Bearer " + accessToken },
      timeout: 10000
    });
    const userId = cleanText(response.data && (response.data.user_id || response.data.id), 240);
    if (!userId) return [];
    const username = cleanText(response.data && response.data.username, 240);
    return [{
      id: "ig:" + userId,
      label: username ? "@" + username : userId,
      detail: "Instagram profesional · acceso directo",
      account_id: userId,
      account_label: username ? "@" + username : userId,
      instagram_user_id: userId,
      access_token: accessToken,
      login_type: "instagram"
    }];
  }

  async discoverWhatsApp(accessToken) {
    const candidates = [];
    const businesses = await this.graph("me/businesses", accessToken, {
      params: { fields: "id,name", limit: 100 }
    });
    for (const business of businesses.data && businesses.data.data || []) {
      const wabas = await this.graph(encodeURIComponent(business.id) + "/owned_whatsapp_business_accounts", accessToken, {
        params: { fields: "id,name", limit: 100 }
      });
      for (const waba of wabas.data && wabas.data.data || []) {
        const phones = await this.graph(encodeURIComponent(waba.id) + "/phone_numbers", accessToken, {
          params: { fields: "id,display_phone_number,verified_name,quality_rating", limit: 100 }
        });
        for (const phone of phones.data && phones.data.data || []) {
          candidates.push({
            id: "wa:" + phone.id,
            label: cleanText(phone.display_phone_number || phone.verified_name || phone.id, 240),
            detail: cleanText((phone.verified_name || waba.name || business.name) + " · " + business.name, 240),
            account_id: String(phone.id),
            account_label: cleanText(phone.display_phone_number || phone.verified_name || phone.id, 240),
            meta_business_id: String(business.id),
            whatsapp_business_account_id: String(waba.id),
            phone_number_id: String(phone.id),
            access_token: accessToken
          });
        }
      }
    }
    return candidates;
  }

  pageCandidate(channel, page, business) {
    const pageToken = cleanText(page && page.access_token, 4096);
    if (!page || !page.id || !pageToken) return null;
    const businessName = cleanText(business && business.name, 120);
    const pageName = cleanText(page.name || "Facebook Page", 120);
    const detail = businessName
      ? businessName + " · Página " + pageName
      : "Vinculada a " + pageName;
    if (channel === "instagram") {
      const instagram = page.instagram_business_account;
      if (!instagram || !instagram.id) return null;
      return {
        id: "ig:" + instagram.id,
        label: cleanText(instagram.username ? "@" + instagram.username : instagram.name || instagram.id, 240),
        detail: cleanText(detail, 240),
        account_id: String(instagram.id),
        account_label: cleanText(instagram.username ? "@" + instagram.username : instagram.name || instagram.id, 240),
        meta_business_id: business && business.id ? String(business.id) : null,
        page_id: String(page.id),
        instagram_user_id: String(instagram.id),
        access_token: pageToken
      };
    }
    return {
      id: "ms:" + page.id,
      label: cleanText(page.name || page.id, 240),
      detail: cleanText(businessName ? businessName + " · Facebook Page" : "Facebook Page", 240),
      account_id: String(page.id),
      account_label: cleanText(page.name || page.id, 240),
      meta_business_id: business && business.id ? String(business.id) : null,
      page_id: String(page.id),
      access_token: pageToken
    };
  }

  addPageCandidates(candidatesById, channel, pages, business) {
    for (const page of pages || []) {
      const candidateId = channel === "instagram"
        ? page && page.instagram_business_account && page.instagram_business_account.id
          ? "ig:" + page.instagram_business_account.id
          : ""
        : page && page.id ? "ms:" + page.id : "";
      const existing = candidateId ? candidatesById.get(candidateId) : null;
      const candidate = this.pageCandidate(channel, Object.assign({}, page || {}, {
        access_token: page && page.access_token || existing && existing.access_token
      }), business);
      if (!candidate) continue;
      // Prefer the portfolio-aware label while retaining any token returned by
      // the direct /me/accounts edge.
      candidatesById.set(candidate.id, Object.assign({}, existing || {}, candidate, {
        access_token: candidate.access_token || existing && existing.access_token
      }));
    }
  }

  async discoverBusinessPages(channel, accessToken, candidatesById) {
    let response;
    try {
      response = await this.graph("me/businesses", accessToken, {
        params: { fields: "id,name", limit: 100 }
      });
    } catch (_) {
      // Keep /me/accounts as a backwards-compatible fallback when the Meta app
      // or user has not granted business_management yet.
      return;
    }
    const fields = "id,name,access_token,tasks,instagram_business_account{id,username,name}";
    for (const business of response.data && response.data.data || []) {
      for (const edge of ["owned_pages", "client_pages"]) {
        try {
          const pagesResponse = await this.graph(
            encodeURIComponent(business.id) + "/" + edge,
            accessToken,
            { params: { fields, limit: 100 } }
          );
          this.addPageCandidates(
            candidatesById,
            channel,
            pagesResponse.data && pagesResponse.data.data || [],
            business
          );
        } catch (_) {
          // One inaccessible portfolio must not hide the remaining businesses.
        }
      }
    }
  }

  async discoverPages(channel, accessToken) {
    const response = await this.graph("me/accounts", accessToken, {
      params: {
        fields: "id,name,access_token,tasks,instagram_business_account{id,username,name}",
        limit: 100
      }
    });
    const candidatesById = new Map();
    this.addPageCandidates(
      candidatesById,
      channel,
      response.data && response.data.data || [],
      null
    );
    await this.discoverBusinessPages(channel, accessToken, candidatesById);
    const candidates = [];
    candidatesById.forEach(function (candidate) { candidates.push(candidate); });
    return candidates;
  }

  async discoverAssets(channel, accessToken) {
    try {
      if (channel === "instagram" && accessToken && accessToken.login_type === "instagram") {
        return await this.discoverInstagramLogin(accessToken);
      }
      const rawToken = cleanText(accessToken && accessToken.access_token || accessToken, 4096);
      if (channel === "whatsapp") return await this.discoverWhatsApp(accessToken);
      return await this.discoverPages(channel, rawToken);
    } catch (error) {
      throw new ChannelConnectionError("asset_discovery_failed", 422, internalError(error));
    }
  }

  async activate(channel, candidate) {
    if (channel === "whatsapp") {
      throw new ChannelConnectionError(
        "whatsapp_activation_retired",
        410,
        "WhatsApp registration is only allowed through the durable Embedded Signup attempt"
      );
    }
    let activationStage = "subscribe";
    try {
      await this.subscribe(channel, candidate);
      const targetId = channel === "instagram" ? candidate.instagram_user_id : candidate.page_id;
      const fields = channel === "instagram" ? "id,username,name" : "id,name";
      const verified = channel === "instagram" && candidate.login_type === "instagram"
        ? await this.instagramGraph(encodeURIComponent(targetId), candidate.access_token, { params: { fields } })
        : await this.graph(encodeURIComponent(targetId), candidate.access_token, { params: { fields } });
      candidate.account_label = cleanText(
        channel === "instagram" && verified.data && verified.data.username
          ? "@" + verified.data.username
          : verified.data && verified.data.name || candidate.account_label,
        240
      );
      return candidate;
    } catch (error) {
      const problem = new ChannelConnectionError("asset_activation_failed", 422, internalError(error));
      problem.activationStage = activationStage;
      problem.meta = metaErrorTelemetry(error);
      throw problem;
    }
  }

  async subscribe(channel, credential) {
    const subscriptionId = channel === "whatsapp"
      ? credential.whatsapp_business_account_id
      : channel === "instagram" && credential.login_type === "instagram"
        ? credential.instagram_user_id
        : credential.page_id;
    if (!subscriptionId || !credential.access_token) {
      throw new ChannelConnectionError("asset_activation_failed", 422, "Missing Meta subscription credentials");
    }
    const request = {
      method: "POST",
      data: {}
    };
    if (channel !== "whatsapp") {
      request.params = {
        subscribed_fields: channel === "instagram"
          ? "messages,messaging_postbacks,message_reactions,messaging_seen"
          : "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads"
      };
    }
    if (channel === "instagram" && credential.login_type === "instagram") {
      await this.instagramGraph(encodeURIComponent(subscriptionId) + "/subscribed_apps", credential.access_token, request);
    } else {
      await this.graph(encodeURIComponent(subscriptionId) + "/subscribed_apps", credential.access_token, request);
    }
    return { ok: true };
  }

  instagramGraph(path, token, config) {
    const settings = Object.assign({}, config || {});
    settings.headers = Object.assign({}, settings.headers || {}, { Authorization: "Bearer " + token });
    settings.timeout = settings.timeout || 10000;
    return this.axios(Object.assign({
      method: "GET",
      url: this.instagramGraphOrigin + "/" + this.graphVersion + "/" + String(path || "").replace(/^\/+/, "")
    }, settings));
  }

  async prepareEmbeddedWhatsApp(code, session, options) {
    const wabaId = cleanText(session && session.waba_id, 240);
    const requestedPhoneNumberId = cleanText(session && session.phone_number_id, 240);
    const businessId = cleanText(session && session.business_id, 240);
    if (!wabaId) {
      throw new ChannelConnectionError("invalid_authorization", 422, "Embedded Signup did not return the WhatsApp account ID");
    }
    // Embedded Signup runs inside Meta's JS SDK. Its OAuth dialog uses Meta's
    // dynamic xd_arbiter URL, so sending our server callback as redirect_uri
    // makes the authorization-code exchange fail. Meta's Embedded Signup
    // exchange is app-id + app-secret + code only.
    const accessToken = await this.exchangeCode(code, Object.assign({}, options || {}, {
      channel: "whatsapp",
      omitRedirectUri: true
    }));
    try {
      const phones = await this.graph(encodeURIComponent(wabaId) + "/phone_numbers", accessToken, {
        params: {
          fields: "id,display_phone_number,verified_name,quality_rating,status,code_verification_status,platform_type,is_on_biz_app",
          limit: 100
        }
      });
      const availablePhones = phones.data && phones.data.data || [];
      let phone = requestedPhoneNumberId
        ? availablePhones.find(function (item) { return String(item && item.id) === requestedPhoneNumberId; })
        : null;
      if (!phone && !requestedPhoneNumberId && availablePhones.length === 1) phone = availablePhones[0];
      if (!phone && !requestedPhoneNumberId) {
        const businessAppPhones = availablePhones.filter(function (item) { return item && item.is_on_biz_app === true; });
        if (businessAppPhones.length === 1) phone = businessAppPhones[0];
      }
      if (!phone) {
        throw new ChannelConnectionError(
          "invalid_authorization",
          422,
          requestedPhoneNumberId
            ? "The selected phone number does not belong to the selected WhatsApp account"
            : "Meta did not identify a unique WhatsApp Business App number"
        );
      }
      const phoneNumberId = cleanText(phone.id, 240);
      const onboardingMode = cleanWhatsAppOnboardingMode(session && session.onboarding_mode) || "cloud_api";
      const coexistenceEventConfirmed = session && (
        session.coexistence === true ||
        session.onboarding_event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" ||
        session.is_wa_login_user === true
      );
      if (onboardingMode !== "cloud_api" || coexistenceEventConfirmed || phone.is_on_biz_app === true) {
        throw new ChannelConnectionError(
          "whatsapp_business_app_number_not_supported",
          409,
          "This release only accepts a new phone number that is not active in WhatsApp or WhatsApp Business App"
        );
      }
      if (String(phone.status || "").toUpperCase() === "CONNECTED") {
        throw new ChannelConnectionError(
          "whatsapp_phone_already_connected",
          409,
          "The selected phone is already connected to WhatsApp Cloud API"
        );
      }
      return {
        id: "wa:" + phoneNumberId,
        account_id: phoneNumberId,
        account_label: cleanText(phone.display_phone_number || phone.verified_name || phoneNumberId, 240),
        meta_business_id: businessId || null,
        whatsapp_business_account_id: wabaId,
        phone_number_id: phoneNumberId,
        access_token: accessToken,
        onboarding_mode: "cloud_api",
        coexistence: false,
        coexistence_event_confirmed: false
      };
    } catch (error) {
      if (error instanceof ChannelConnectionError) throw error;
      throw new ChannelConnectionError("invalid_authorization", 422, internalError(error));
    }
  }

  async registerWhatsApp(candidate) {
    const phoneNumberId = cleanText(candidate && candidate.phone_number_id, 240);
    const accessToken = cleanText(candidate && candidate.access_token, 4096);
    const registrationPin = cleanWhatsAppRegistrationPin(candidate && candidate.registration_pin);
    if (!phoneNumberId || !accessToken || !registrationPin) {
      throw new ChannelConnectionError("asset_activation_failed", 422, "Missing WhatsApp registration credentials");
    }
    try {
      await this.graph(encodeURIComponent(phoneNumberId) + "/register", accessToken, {
        method: "POST",
        data: {
          messaging_product: "whatsapp",
          pin: registrationPin
        }
      });
      this.logger("info", "whatsapp_phone_registration_succeeded", {
        phone_number_suffix: phoneNumberId.slice(-8) || null,
        waba_suffix: String(candidate.whatsapp_business_account_id || "").slice(-8) || null
      });
      return { ok: true };
    } catch (error) {
      const problem = new ChannelConnectionError("asset_activation_failed", 422, internalError(error));
      problem.activationStage = "register";
      problem.meta = metaErrorTelemetry(error);
      problem.http_status = Number(error && error.response && error.response.status) || null;
      throw problem;
    }
  }

  async verify(channel, credential) {
    try {
      const targetId = channel === "whatsapp"
        ? credential.phone_number_id
        : channel === "instagram"
          ? credential.instagram_user_id
          : credential.page_id;
      const fields = channel === "whatsapp"
        ? "id,display_phone_number,verified_name,status,code_verification_status,platform_type,is_on_biz_app"
        : channel === "instagram" ? "id,username,name" : "id,name";
      const directInstagram = channel === "instagram" && credential.login_type === "instagram";
      const graphRequest = directInstagram ? this.instagramGraph.bind(this) : this.graph.bind(this);
      const verified = await graphRequest(encodeURIComponent(targetId), credential.access_token, { params: { fields } });
      const subscriptionId = channel === "whatsapp"
        ? credential.whatsapp_business_account_id
        : directInstagram ? credential.instagram_user_id : credential.page_id;
      const subscription = await graphRequest(encodeURIComponent(subscriptionId) + "/subscribed_apps", credential.access_token, {});
      const subscribedApps = subscription.data && Array.isArray(subscription.data.data)
        ? subscription.data.data
        : [];
      // WhatsApp's current Graph response nests the subscribed app under
      // whatsapp_business_api_data, while Page subscriptions still expose id
      // at the top level. Accept both shapes so a valid WABA subscription is
      // not incorrectly marked as missing.
      // Instagram Login can report either the Instagram product app id or the
      // parent Meta app id in /subscribed_apps. Both are first-party ids from
      // this configured provider; no unrelated subscription is accepted.
      const expectedAppIds = directInstagram
        ? [this.instagramAppId, this.appId].filter(Boolean).map(String)
        : [String(this.appId)];
      const appSubscribed = subscribedApps.some((app) => {
        const subscribedAppId = app && (
          app.id || app.whatsapp_business_api_data && app.whatsapp_business_api_data.id
        );
        if (expectedAppIds.includes(String(subscribedAppId || ""))) return true;
        if (!directInstagram) return false;
        // Instagram Login can return an internal platform-app id that is not
        // either public app id. The access token is app-scoped, so the exact
        // messaging field set returned after our successful subscription is
        // also authoritative proof that this app is installed for the user.
        const subscribedFields = new Set(Array.isArray(app && app.subscribed_fields)
          ? app.subscribed_fields.map(String)
          : []);
        return ["messages", "messaging_postbacks", "message_reactions", "messaging_seen"]
          .every(function (field) { return subscribedFields.has(field); });
      });
      const registrationReady = channel !== "whatsapp" ||
        String(verified.data && verified.data.status || "").toUpperCase() === "CONNECTED";
      const verifiedTargetId = verified.data && (
        verified.data.id || directInstagram && verified.data.user_id
      );
      // Instagram Login responses use user_id on some identity endpoints.
      // A successful request to the exact requested user is also sufficient
      // when Meta omits that identifier but returns the professional profile.
      const targetVerified = directInstagram
        ? !!(verified.data && (
          String(verifiedTargetId || "") === String(targetId) || verified.data.username
        ))
        : !!(verified.data && String(verifiedTargetId || "") === String(targetId));
      return {
        ok: !!(targetVerified && appSubscribed && registrationReady),
        pending: channel === "whatsapp" && !!targetVerified && !!appSubscribed && !registrationReady,
        account_label: cleanText(
          verified.data && (verified.data.display_phone_number || verified.data.username && "@" + verified.data.username || verified.data.name),
          240
        ),
        error: !appSubscribed
          ? "Meta webhook subscription is missing"
          : !registrationReady
            ? credential.coexistence === true
              ? "Meta is still completing WhatsApp Business App onboarding"
              : "WhatsApp number is not CONNECTED in Cloud API"
            : null
      };
    } catch (error) {
      const status = Number(error && error.response && error.response.status);
      const telemetry = metaErrorTelemetry(error);
      return {
        ok: false,
        transient: !status || status === 408 || status === 429 || status >= 500,
        meta_code: telemetry.meta_code,
        error: internalError(error)
      };
    }
  }

  async inspectWhatsApp(credential) {
    try {
      if (!credential || !credential.phone_number_id || !credential.whatsapp_business_account_id ||
          !credential.access_token) {
        throw new ChannelConnectionError("existing_asset_credentials_required", 409);
      }
      const phone = await this.graph(encodeURIComponent(credential.phone_number_id), credential.access_token, {
        params: {
          fields: "id,display_phone_number,verified_name,quality_rating,status,code_verification_status,platform_type,is_on_biz_app"
        }
      });
      const subscriptions = await this.graph(
        encodeURIComponent(credential.whatsapp_business_account_id) + "/subscribed_apps",
        credential.access_token,
        {}
      );
      let accountReviewStatus = null;
      try {
        const waba = await this.graph(
          encodeURIComponent(credential.whatsapp_business_account_id),
          credential.access_token,
          { params: { fields: "id,account_review_status" } }
        );
        accountReviewStatus = cleanText(waba.data && waba.data.account_review_status, 80) || null;
      } catch (_) {}
      const subscribedApps = subscriptions.data && Array.isArray(subscriptions.data.data)
        ? subscriptions.data.data
        : [];
      const appSubscribed = subscribedApps.some((app) => String(app && (
        app.id || app.whatsapp_business_api_data && app.whatsapp_business_api_data.id
      ) || "") === String(this.appId));
      const data = phone.data || {};
      const connectionStatus = cleanText(data.status, 80) || null;
      const platformType = cleanText(data.platform_type, 80) || null;
      const verificationStatus = cleanText(data.code_verification_status, 80) || null;
      const isOnBizApp = data.is_on_biz_app === true;
      return {
        ok: true,
        account_label: cleanText(data.display_phone_number || data.verified_name, 240) || null,
        code_verification_status: verificationStatus,
        status: connectionStatus,
        platform_type: platformType,
        is_on_biz_app: isOnBizApp,
        detected_mode: isOnBizApp ? "coexistence" : "cloud_api",
        app_subscribed: appSubscribed,
        account_review_status: accountReviewStatus,
        registration_ready: String(connectionStatus || "").toUpperCase() === "CONNECTED"
      };
    } catch (error) {
      throw error instanceof ChannelConnectionError
        ? error
        : new ChannelConnectionError("connection_verification_failed", 422, internalError(error));
    }
  }

  async disconnect(channel, credential) {
    try {
      const directInstagram = channel === "instagram" && credential.login_type === "instagram";
      const subscriptionId = channel === "whatsapp"
        ? credential.whatsapp_business_account_id
        : directInstagram ? credential.instagram_user_id : credential.page_id;
      const graphRequest = directInstagram ? this.instagramGraph.bind(this) : this.graph.bind(this);
      await graphRequest(encodeURIComponent(subscriptionId) + "/subscribed_apps", credential.access_token, { method: "DELETE" });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: internalError(error) };
    }
  }
}

function createLegacyConnections(options) {
  options = options || {};
  const tenantId = cleanTenantId(options.tenantId);
  if (!tenantId) return [];
  const now = options.lastVerifiedAt || null;
  const rows = [];
  if (options.whatsapp && options.whatsapp.configured) {
    rows.push(Object.assign(emptyConnection(tenantId, "whatsapp"), {
      status: options.whatsapp.needsAttention || !now ? "needs_attention" : "connected",
      account_id: cleanText(options.whatsapp.phoneNumberId, 240) || null,
      account_label: cleanText(options.whatsapp.displayPhone, 240) || "WhatsApp Business",
      phone_number_id: cleanText(options.whatsapp.phoneNumberId, 240) || null,
      webhook_status: options.whatsapp.webhookStatus || "configured",
      last_verified_at: now,
      credential_source: "environment",
      protected_legacy: true
    }));
  }
  if (options.instagram && options.instagram.configured) {
    rows.push(Object.assign(emptyConnection(tenantId, "instagram"), {
      status: options.instagram.needsAttention || !now ? "needs_attention" : "connected",
      account_id: cleanText(options.instagram.userId, 240) || null,
      account_label: cleanText(options.instagram.label, 240) || "Instagram profesional",
      instagram_user_id: cleanText(options.instagram.userId, 240) || null,
      webhook_status: options.instagram.webhookStatus || "configured",
      last_verified_at: now,
      credential_source: "environment",
      protected_legacy: true
    }));
  }
  if (options.messenger && options.messenger.configured) {
    rows.push(Object.assign(emptyConnection(tenantId, "messenger"), {
      status: options.messenger.needsAttention || !now ? "needs_attention" : "connected",
      account_id: cleanText(options.messenger.pageId, 240) || null,
      account_label: cleanText(options.messenger.label, 240) || "Facebook Page",
      page_id: cleanText(options.messenger.pageId, 240) || null,
      webhook_status: options.messenger.webhookStatus || "configured",
      last_verified_at: now,
      credential_source: "environment",
      protected_legacy: true
    }));
  }
  return rows;
}

function createChannelConnectionService(options) {
  options = options || {};
  const store = options.store;
  const provider = options.provider;
  const encryptionKey = options.encryptionKey;
  const legacyConnections = Array.isArray(options.legacyConnections) ? options.legacyConnections : [];
  const allowProtectedLegacyReconnect = typeof options.allowProtectedLegacyReconnect === "function"
    ? options.allowProtectedLegacyReconnect
    : function () { return false; };
  const replaceableOwnershipTenant = typeof options.replaceableOwnershipTenant === "function"
    ? options.replaceableOwnershipTenant
    : function () { return false; };
  const now = typeof options.now === "function" ? options.now : function () { return new Date(); };
  const tenantAliases = options.tenantAliases && typeof options.tenantAliases === "object"
    ? options.tenantAliases
    : {};
  const whatsappOnboardingInFlight = new Set();

  if (!store) throw new Error("channel_connection_store_required");

  function canonicalTenantId(tenantId) {
    let current = cleanTenantId(tenantId);
    const seen = new Set();
    while (current && !seen.has(current)) {
      seen.add(current);
      const next = cleanTenantId(tenantAliases[current]);
      if (!next || next === current) break;
      current = next;
    }
    return current;
  }

  function sameTenant(left, right) {
    const cleanLeft = canonicalTenantId(left);
    const cleanRight = canonicalTenantId(right);
    return !!cleanLeft && cleanLeft === cleanRight;
  }

  function assertTenantChannel(tenantId, channel) {
    const cleanTenant = cleanTenantId(tenantId);
    const clean = cleanChannel(channel);
    if (!cleanTenant || !clean) throw new ChannelConnectionError("invalid_channel_request", 400);
    return { tenantId: cleanTenant, channel: clean };
  }

  function credentialPayload(record) {
    if (!record || !record.credentials_ciphertext) return null;
    if (!encryptionKey) throw new ChannelConnectionError("secure_storage_unavailable", 503);
    try {
      return JSON.parse(decryptStoredText(record.credentials_ciphertext, encryptionKey));
    } catch (error) {
      throw new ChannelConnectionError("secure_storage_unavailable", 503, error.message);
    }
  }

  function encryptedCredential(value) {
    if (!encryptionKey) throw new ChannelConnectionError("secure_storage_unavailable", 503);
    return encryptStoredText(JSON.stringify(value), encryptionKey);
  }

  function onboardingAttemptPayload(record) {
    if (!record || !record.onboarding_attempt_ciphertext) return null;
    if (!encryptionKey) throw new ChannelConnectionError("secure_storage_unavailable", 503);
    try {
      return JSON.parse(decryptStoredText(record.onboarding_attempt_ciphertext, encryptionKey));
    } catch (error) {
      throw new ChannelConnectionError("secure_storage_unavailable", 503, error.message);
    }
  }

  function whatsappAttemptIsActive(record) {
    return whatsappAttemptRecordIsActive(record);
  }

  function legacyFor(tenantId, channel) {
    return legacyConnections.find(function (row) {
      return row.tenant_id === tenantId && row.channel === channel;
    }) || null;
  }

  function preferStoredConnection(stored, legacy) {
    if (!stored) return legacy || null;
    if (!legacy) return stored;
    // A real encrypted OAuth record supersedes the environment fallback.
    // A stale disconnected/failed row without credentials does not.
    return stored.credentials_ciphertext && !stored.protected_legacy ? stored : legacy;
  }

  async function ownershipRows() {
    let rows;
    try { rows = await store.listAll(); }
    catch (error) { throw mapStoreError(error); }
    rows = Array.isArray(rows) ? rows.slice() : [];
    legacyConnections.forEach(function (legacy) {
      const storedIndex = rows.findIndex(function (row) {
        return row.tenant_id === legacy.tenant_id && row.channel === legacy.channel;
      });
      if (storedIndex < 0) rows.push(legacy);
      else rows[storedIndex] = preferStoredConnection(rows[storedIndex], legacy);
    });
    return rows;
  }

  async function storedOrLegacy(tenantId, channel) {
    const stored = await store.get(tenantId, channel);
    return preferStoredConnection(stored, legacyFor(tenantId, channel));
  }

  function assetIdentityKeys(channel, record) {
    const clean = cleanChannel(channel);
    const keys = [];
    function add(kind, value) {
      const id = cleanText(value, 240);
      if (id) keys.push(kind + ":" + id);
    }
    if (clean === "whatsapp") {
      add("phone", record && (record.phone_number_id || record.account_id));
      add("waba", record && record.whatsapp_business_account_id);
      if (whatsappAttemptIsActive(record)) {
        add("phone", record.onboarding_attempt_phone_number_id);
        add("waba", record.onboarding_attempt_waba_id);
      }
    } else if (clean === "instagram") {
      add("instagram", record && (record.instagram_user_id || record.account_id));
      add("page", record && record.page_id);
    } else if (clean === "messenger") {
      add("page", record && (record.page_id || record.account_id));
    }
    return Array.from(new Set(keys));
  }

  async function assertAssetAvailable(tenantId, channel, candidate) {
    const candidateKeys = assetIdentityKeys(channel, candidate);
    if (!candidateKeys.length) throw new ChannelConnectionError("invalid_asset_selection", 400);
    const rows = (await ownershipRows()).concat(legacyConnections);
    const conflicts = rows.filter(function (row) {
      if (!row || sameTenant(row.tenant_id, tenantId) || cleanChannel(row.channel) !== channel) return false;
      if (!["connecting", "connected", "needs_attention"].includes(row.status)) return false;
      const existingKeys = assetIdentityKeys(channel, row);
      return existingKeys.some(function (key) { return candidateKeys.includes(key); });
    });
    const blockingConflict = conflicts.find(function (row) {
      return !replaceableOwnershipTenant(row.tenant_id, tenantId, channel, row);
    });
    if (blockingConflict) {
      throw new ChannelConnectionError(
        "channel_asset_already_assigned",
        409,
        "Channel asset is already assigned to tenant " + cleanTenantId(blockingConflict.tenant_id)
      );
    }
    // App-review tenants are temporary sandboxes. Once a real customer claims
    // the reviewed asset, retire the sandbox row before subscribing the live
    // tenant. This is a logical ownership transfer only: the app-level Meta
    // subscription stays intact and the new OAuth credential becomes the sole
    // runtime source.
    for (const conflict of conflicts) {
      const releasedAt = iso(now());
      await store.upsert({
        tenant_id: conflict.tenant_id,
        channel,
        status: "disconnected",
        webhook_status: "ownership_released",
        last_error: null,
        last_error_at: null,
        disconnected_at: releasedAt,
        disconnected_by: "system:temporary-owner-release",
        account_id: null,
        account_label: null,
        meta_business_id: null,
        whatsapp_business_account_id: null,
        phone_number_id: null,
        page_id: null,
        instagram_user_id: null,
        updated_at: releasedAt,
        pending_assets: [],
        credentials_ciphertext: null,
        credential_source: null,
        protected_legacy: false
      }, {
        action: "temporary_ownership_released",
        actor: "system:temporary-owner-release",
        details: { replacement_tenant_id: tenantId, channel }
      });
    }
  }

  function effectiveAssetOwner(record, rows) {
    if (!record || !["connecting", "connected", "needs_attention"].includes(record.status)) return record;
    const keys = assetIdentityKeys(record.channel, record);
    if (!keys.length) return record;
    const ownershipClaims = rows.concat(legacyConnections);
    const conflicts = ownershipClaims.filter(function (other) {
      if (!other || sameTenant(other.tenant_id, record.tenant_id) ||
          cleanChannel(other.channel) !== cleanChannel(record.channel) ||
          !["connecting", "connected", "needs_attention"].includes(other.status)) return false;
      return assetIdentityKeys(record.channel, other).some(function (key) { return keys.includes(key); });
    });
    if (!conflicts.length) return record;
    const protectedOwner = [record].concat(conflicts, ownershipClaims.filter(function (other) {
      return other && cleanChannel(other.channel) === cleanChannel(record.channel) &&
        assetIdentityKeys(record.channel, other).some(function (key) { return keys.includes(key); });
    })).find(function (row) { return row.protected_legacy; });
    if (protectedOwner && sameTenant(protectedOwner.tenant_id, record.tenant_id)) return record;
    // Never present a duplicated asset as connected to the losing tenant. If
    // there is no protected owner, every conflicting tenant fails closed.
    return null;
  }

  async function markFailure(tenantId, channel, actor, error) {
    const existing = await store.get(tenantId, channel);
    const preserveRegistrationCooldown = channel === "whatsapp" &&
      error && error.code === "whatsapp_activation_rate_limited" &&
      whatsappActivationRetryAt(existing, now());
    return store.upsert(Object.assign(emptyConnection(tenantId, channel), existing || {}, {
      tenant_id: tenantId,
      channel,
      status: "needs_attention",
      last_error: preserveRegistrationCooldown ? existing.last_error : internalError(error),
      last_error_at: preserveRegistrationCooldown ? existing.last_error_at : iso(now()),
      updated_at: iso(now()),
      pending_assets: []
    }), {
      action: "connection_failed",
      actor: actorLabel(actor),
      details: { error: internalError(error) }
    });
  }

  async function connectCandidate(tenantId, channel, actor, candidate) {
    if (channel === "whatsapp") {
      throw new ChannelConnectionError(
        "whatsapp_activation_retired",
        410,
        "WhatsApp can only be connected through the durable Embedded Signup attempt"
      );
    }
    // Check before subscribing so an OAuth callback cannot attach the same
    // Instagram/Page/phone asset to two tenants.
    await assertAssetAvailable(tenantId, channel, candidate);
    const activated = await provider.activate(channel, candidate);
    const connectedAt = iso(now());
    const activationPending = channel === "whatsapp" && activated.activation_pending === true;
    return store.upsert({
      tenant_id: tenantId,
      channel,
      status: activationPending ? "connecting" : "connected",
      account_id: activated.account_id,
      account_label: activated.account_label,
      meta_business_id: activated.meta_business_id || null,
      whatsapp_business_account_id: activated.whatsapp_business_account_id || null,
      phone_number_id: activated.phone_number_id || null,
      page_id: activated.page_id || null,
      instagram_user_id: activated.instagram_user_id || null,
      webhook_status: activationPending ? "pending_activation" : "subscribed",
      registration_pin_required: activationPending && activated.registration_pin_required === true,
      coexistence_confirmed: activated.coexistence_event_confirmed === true,
      last_verified_at: connectedAt,
      last_error: null,
      last_error_at: null,
      connected_at: activationPending ? null : connectedAt,
      disconnected_at: null,
      connected_by: actorLabel(actor),
      disconnected_by: null,
      protected_legacy: false,
      updated_at: connectedAt,
      pending_assets: [],
      credentials_ciphertext: encryptedCredential({
        access_token: activated.access_token,
        login_type: activated.login_type || null,
        onboarding_mode: cleanWhatsAppOnboardingMode(activated.onboarding_mode) ||
          (activated.coexistence === true ? "coexistence" : "cloud_api"),
        coexistence: activated.coexistence === true,
        coexistence_event_confirmed: activated.coexistence_event_confirmed === true,
        registration_pin: activated.coexistence === true
          ? null
          : cleanWhatsAppRegistrationPin(activated.registration_pin) || null,
        registration_submitted: activated.registration_submitted === true,
        meta_business_id: activated.meta_business_id || null,
        whatsapp_business_account_id: activated.whatsapp_business_account_id || null,
        phone_number_id: activated.phone_number_id || null,
        page_id: activated.page_id || null,
        instagram_user_id: activated.instagram_user_id || null
      }),
      credential_source: "oauth",
      protected_legacy: false
    }, {
      action: activationPending ? "activation_pending" : "connected",
      actor: actorLabel(actor),
      details: {
        account_id: activated.account_id,
        account_label: activated.account_label,
        reason: activationPending ? cleanText(activated.activation_error, 240) : null
      }
    });
  }

  function whatsappCredentialFromCandidate(candidate) {
    return {
      access_token: cleanText(candidate && candidate.access_token, 4096),
      login_type: null,
      onboarding_mode: "cloud_api",
      coexistence: false,
      coexistence_event_confirmed: false,
      registration_submitted: candidate && candidate.registration_submitted === true,
      meta_business_id: cleanText(candidate && candidate.meta_business_id, 240) || null,
      whatsapp_business_account_id: cleanText(candidate && candidate.whatsapp_business_account_id, 240),
      phone_number_id: cleanText(candidate && candidate.phone_number_id, 240),
      page_id: null,
      instagram_user_id: null
    };
  }

  async function saveWhatsAppAttempt(record, actor, fields, action, details) {
    const updatedAt = iso(now());
    const transition = await store.updateWhatsAppAttempt(
      record.tenant_id,
      record.onboarding_attempt_id,
      Object.assign({}, fields || {}, {
      onboarding_attempt_updated_at: updatedAt,
      updated_at: updatedAt
      }), {
        action,
        actor: actorLabel(actor),
        details: details || {}
      }
    );
    if (transition && transition.updated) return transition.row;
    const current = transition && transition.row;
    if (current && current.onboarding_attempt_id === record.onboarding_attempt_id &&
        current.onboarding_attempt_status === "completed" && current.status === "connected") {
      return current;
    }
    throw new ChannelConnectionError("connection_selection_expired", 409);
  }

  async function failWhatsAppAttempt(record, actor, error, status, extraFields) {
    const problem = error instanceof ChannelConnectionError
      ? error
      : new ChannelConnectionError("asset_activation_failed", 422, internalError(error));
    const activeConnectionExists = record.status === "connected" && !!record.credentials_ciphertext;
    return saveWhatsAppAttempt(record, actor, Object.assign({
      status: activeConnectionExists ? "connected" : "needs_attention",
      webhook_status: activeConnectionExists ? record.webhook_status : "not_configured",
      onboarding_attempt_status: status || "failed",
      onboarding_attempt_last_error: internalError(problem),
      onboarding_attempt_last_error_at: iso(now()),
      last_error: activeConnectionExists ? record.last_error : internalError(problem),
      last_error_at: activeConnectionExists ? record.last_error_at : iso(now())
    }, extraFields || {}), "whatsapp_onboarding_failed", {
      code: problem.code,
      stage: status || "failed",
      error: internalError(problem)
    });
  }

  async function promoteWhatsAppAttempt(record, candidate, actor, verification) {
    const connectedAt = iso(now());
    const credential = whatsappCredentialFromCandidate(candidate);
    const accountLabel = cleanText(
      verification && verification.account_label || candidate.account_label || candidate.phone_number_id,
      240
    );
    return saveWhatsAppAttempt(record, actor, {
      status: "connected",
      account_id: credential.phone_number_id,
      account_label: accountLabel,
      meta_business_id: credential.meta_business_id,
      whatsapp_business_account_id: credential.whatsapp_business_account_id,
      phone_number_id: credential.phone_number_id,
      page_id: null,
      instagram_user_id: null,
      webhook_status: "subscribed",
      last_verified_at: connectedAt,
      last_error: null,
      last_error_at: null,
      connected_at: connectedAt,
      disconnected_at: null,
      connected_by: actorLabel(actor),
      disconnected_by: null,
      pending_assets: [],
      credentials_ciphertext: encryptedCredential(credential),
      credential_source: "oauth",
      registration_pin_required: false,
      protected_legacy: false,
      onboarding_attempt_status: "completed",
      onboarding_attempt_updated_at: connectedAt,
      onboarding_attempt_registration_accepted_at:
        record.onboarding_attempt_registration_accepted_at || connectedAt,
      onboarding_attempt_subscription_confirmed_at:
        record.onboarding_attempt_subscription_confirmed_at || connectedAt,
      onboarding_attempt_ciphertext: null,
      onboarding_attempt_last_error: null,
      onboarding_attempt_last_error_at: null,
      updated_at: connectedAt
    }, "connected", {
      account_id: credential.phone_number_id,
      account_label: accountLabel,
      onboarding_attempt_id: record.onboarding_attempt_id
    });
  }

  async function finishWhatsAppAttempt(tenantId, actor, input) {
    let record = await store.get(tenantId, "whatsapp");
    if (!record) throw new ChannelConnectionError("connection_not_found", 404);
    const attemptId = cleanText(input && input.attempt_id, 100);
    if (!attemptId || record.onboarding_attempt_id !== attemptId) {
      throw new ChannelConnectionError("connection_selection_expired", 409, "WhatsApp onboarding attempt does not match");
    }
    if (record.onboarding_attempt_status === "completed" && record.status === "connected") {
      return record;
    }
    if (!whatsappAttemptIsActive(record)) {
      throw new ChannelConnectionError("connection_selection_expired", 409);
    }
    const inFlightKey = tenantId + ":" + attemptId;
    if (whatsappOnboardingInFlight.has(inFlightKey)) {
      throw new ChannelConnectionError("whatsapp_activation_in_progress", 409);
    }
    whatsappOnboardingInFlight.add(inFlightKey);
    let registrationClaimedByThisCall = false;
    try {
      let candidate = onboardingAttemptPayload(record);
      if (!candidate) {
        if (!cleanText(input && input.code, 2000)) {
          throw new ChannelConnectionError("invalid_authorization", 422, "Meta authorization code is missing");
        }
        candidate = await provider.prepareEmbeddedWhatsApp(
          input.code,
          Object.assign({}, input.session || {}, { onboarding_mode: "cloud_api" }),
          { redirectUri: input.redirect_uri }
        );
        if (candidate.coexistence === true || candidate.coexistence_event_confirmed === true) {
          throw new ChannelConnectionError(
            "whatsapp_business_app_number_not_supported",
            409,
            "Use a new phone number that is not active in WhatsApp Business App"
          );
        }
        await assertAssetAvailable(tenantId, "whatsapp", candidate);
        const phoneNumberId = cleanText(candidate.phone_number_id, 240);
        const previousPhoneNumberId = cleanText(record.whatsapp_last_registration_phone_number_id, 240);
        const previousRegistrationAt = new Date(record.whatsapp_last_registration_requested_at || 0).getTime();
        const withinRegistrationWindow = Number.isFinite(previousRegistrationAt) &&
          new Date(now()).getTime() - previousRegistrationAt < WHATSAPP_REGISTRATION_COOLDOWN_MS;
        if (phoneNumberId && phoneNumberId === previousPhoneNumberId && withinRegistrationWindow) {
          throw new ChannelConnectionError(
            "whatsapp_activation_rate_limited",
            429,
            "Nextfor already submitted registration for this phone during the last 72 hours"
          );
        }
        candidate.registration_pin = String(crypto.randomInt(100000, 1000000));
        candidate.registration_submitted = false;
        const bound = await store.bindWhatsAppAttemptAsset(tenantId, attemptId, {
          status: "connecting",
          webhook_status: "not_configured",
          onboarding_attempt_status: "asset_validated",
          onboarding_attempt_phone_number_id: phoneNumberId,
          onboarding_attempt_waba_id: cleanText(candidate.whatsapp_business_account_id, 240),
          onboarding_attempt_ciphertext: encryptedCredential(candidate),
          onboarding_attempt_last_error: null,
          onboarding_attempt_last_error_at: null,
          last_error: null,
          last_error_at: null,
          onboarding_attempt_updated_at: iso(now()),
          updated_at: iso(now())
        }, {
          action: "whatsapp_asset_validated",
          actor: actorLabel(actor),
          details: {
            onboarding_attempt_id: attemptId,
            phone_number_suffix: phoneNumberId.slice(-8),
            waba_suffix: String(candidate.whatsapp_business_account_id || "").slice(-8)
          }
        });
        record = bound && bound.row;
        if (!bound || !bound.bound || !record || record.onboarding_attempt_id !== attemptId) {
          throw new ChannelConnectionError("connection_selection_expired", 409);
        }
        candidate = onboardingAttemptPayload(record) || candidate;
      }

      if (!record.onboarding_attempt_registration_requested_at) {
        const requestedAt = iso(now());
        candidate.registration_submitted = true;
        // Atomically claim the one permitted /register call before the network
        // request. A second process or duplicate callback receives claimed=false
        // and can only verify the stored attempt.
        const claim = await store.claimWhatsAppRegistration(tenantId, attemptId, {
          onboarding_attempt_status: "registering",
          onboarding_attempt_registration_requested_at: requestedAt,
          whatsapp_last_registration_phone_number_id: cleanText(candidate.phone_number_id, 240),
          whatsapp_last_registration_requested_at: requestedAt,
          onboarding_attempt_ciphertext: encryptedCredential(candidate),
          onboarding_attempt_reconcile_count: 0,
          onboarding_attempt_reconcile_after: new Date(new Date(requestedAt).getTime() + 30000).toISOString(),
          onboarding_attempt_reconcile_lease_until: null,
          onboarding_attempt_reconcile_owner: null,
          onboarding_attempt_updated_at: requestedAt,
          updated_at: requestedAt
        }, {
          action: "whatsapp_registration_requested",
          actor: actorLabel(actor),
          details: {
            onboarding_attempt_id: attemptId,
            phone_number_suffix: String(candidate.phone_number_id || "").slice(-8)
          }
        });
        record = claim && claim.row;
        if (!record || record.onboarding_attempt_id !== attemptId) {
          throw new ChannelConnectionError("connection_selection_expired", 409);
        }
        candidate = onboardingAttemptPayload(record) || candidate;
        if (claim.claimed) {
          registrationClaimedByThisCall = true;
          const credentialAfterDispatch = Object.assign({}, candidate);
          // The generated 2FA PIN is needed only for the one permitted
          // /register dispatch. It must not remain in durable attempt state
          // once that request has either returned or produced an unknown
          // outcome, because the request is never repeated.
          delete credentialAfterDispatch.registration_pin;
          try {
            await provider.registerWhatsApp(candidate);
          } catch (error) {
            const outcomeUnknown = !isDefinitiveWhatsAppRegistrationRejection(error);
            await failWhatsAppAttempt(
              record,
              actor,
              error,
              outcomeUnknown ? "registration_outcome_unknown" : "registration_rejected",
              { onboarding_attempt_ciphertext: encryptedCredential(credentialAfterDispatch) }
            );
            if (error && error.activationStage === "register" && isWhatsAppRegistrationRateLimit(error)) {
              const limited = new ChannelConnectionError("whatsapp_activation_rate_limited", 429, internalError(error));
              limited.meta = error.meta;
              throw limited;
            }
            throw error;
          }
          candidate = credentialAfterDispatch;
          record = await saveWhatsAppAttempt(record, actor, {
            onboarding_attempt_status: "registered",
            onboarding_attempt_registration_accepted_at: iso(now()),
            onboarding_attempt_ciphertext: encryptedCredential(candidate)
          }, "whatsapp_registration_accepted", {
            onboarding_attempt_id: attemptId
          });
        }
      }

      if (record.onboarding_attempt_registration_requested_at &&
          !record.onboarding_attempt_registration_accepted_at) {
        const attemptStage = cleanText(record.onboarding_attempt_status, 80).toLowerCase();
        if (attemptStage === "registration_rejected") return record;
        const requestedAt = Date.parse(record.onboarding_attempt_registration_requested_at || "");
        const registrationMayBeInFlight = attemptStage === "registering" &&
          Number.isFinite(requestedAt) && new Date(now()).getTime() - requestedAt < 15000;
        // Another server owns the one-shot /register call. While it is in
        // flight, this process must not subscribe or write an older snapshot.
        // If its outcome stayed unknown after the safety window, only resume
        // with idempotent subscription and read-only verification.
        if (registrationMayBeInFlight) return record;
      }

      if (!record.onboarding_attempt_subscription_confirmed_at) {
        await provider.subscribe("whatsapp", candidate);
        record = await saveWhatsAppAttempt(record, actor, {
          onboarding_attempt_status: "verifying",
          onboarding_attempt_subscription_confirmed_at: iso(now()),
          onboarding_attempt_ciphertext: encryptedCredential(candidate)
        }, "whatsapp_subscription_confirmed", {
          onboarding_attempt_id: attemptId
        });
      }

      let verification = null;
      const requestedChecks = Number(input && input.verification_checks);
      const maximumChecks = Number.isFinite(requestedChecks)
        ? Math.max(1, Math.min(10, requestedChecks))
        : Number.isFinite(Number(options.whatsappVerificationChecks))
        ? Math.max(1, Math.min(10, Number(options.whatsappVerificationChecks)))
        : 5;
      const requestedIntervalMs = Number(input && input.verification_interval_ms);
      const intervalMs = Number.isFinite(requestedIntervalMs)
        ? Math.max(0, Math.min(5000, requestedIntervalMs))
        : Number.isFinite(Number(options.whatsappVerificationIntervalMs))
        ? Math.max(0, Math.min(5000, Number(options.whatsappVerificationIntervalMs)))
        : 1200;
      for (let index = 0; index < maximumChecks; index++) {
        verification = await provider.verify("whatsapp", candidate);
        if (verification.ok) break;
        if (index + 1 < maximumChecks && intervalMs > 0) {
          await new Promise(function (resolve) { setTimeout(resolve, intervalMs); });
        }
      }
      if (!verification || !verification.ok) {
        const stage = record.onboarding_attempt_registration_accepted_at
          ? "awaiting_meta"
          : "registration_outcome_unknown";
        return saveWhatsAppAttempt(record, actor, {
          status: "connecting",
          webhook_status: record.onboarding_attempt_subscription_confirmed_at ? "subscribed_pending_phone" : "not_configured",
          onboarding_attempt_status: stage,
          onboarding_attempt_last_error: verification && verification.error || null,
          onboarding_attempt_last_error_at: verification && verification.error ? iso(now()) : null,
          last_error: null,
          last_error_at: null
        }, "whatsapp_connection_pending", {
          onboarding_attempt_id: attemptId,
          reason: verification && verification.error || null
        });
      }
      return promoteWhatsAppAttempt(record, candidate, actor, verification);
    } catch (error) {
      const latest = await store.get(tenantId, "whatsapp");
      const alreadyRecorded = latest && ["failed", "registration_rejected", "registration_outcome_unknown"].includes(
        cleanText(latest.onboarding_attempt_status, 80).toLowerCase()
      );
      const claimedByAnotherCall = latest && latest.onboarding_attempt_registration_requested_at &&
        !registrationClaimedByThisCall;
      if (!alreadyRecorded && !claimedByAnotherCall && latest && latest.onboarding_attempt_id === attemptId) {
        await failWhatsAppAttempt(latest, actor, error, "failed");
      }
      throw error instanceof ChannelConnectionError
        ? error
        : new ChannelConnectionError("asset_activation_failed", 422, internalError(error));
    } finally {
      whatsappOnboardingInFlight.delete(inFlightKey);
    }
  }

  return {
    catalog() {
      return CHANNEL_CATALOG.map(function (item) { return Object.assign({}, item); });
    },

    providerConfigured(channel) {
      return !!(provider && provider.configured(cleanChannel(channel)));
    },

    async adoptExisting(tenantId, channel, actor, candidate) {
      const clean = assertTenantChannel(tenantId, channel);
      if (clean.channel === "whatsapp") {
        throw new ChannelConnectionError("whatsapp_activation_retired", 410);
      }
      const asset = candidate && typeof candidate === "object" ? Object.assign({}, candidate) : null;
      if (!provider || !provider.configured(clean.channel)) {
        throw new ChannelConnectionError("channel_oauth_not_configured", 503);
      }
      if (!asset || !cleanText(asset.access_token, 4096)) {
        throw new ChannelConnectionError("existing_asset_credentials_required", 400);
      }
      if (clean.channel === "whatsapp" &&
          (!cleanText(asset.whatsapp_business_account_id, 240) || !cleanText(asset.phone_number_id, 240))) {
        throw new ChannelConnectionError("existing_asset_identity_required", 400);
      }
      try {
        return publicConnection(await connectCandidate(clean.tenantId, clean.channel, actor, asset), { superAdmin: true });
      } catch (error) {
        await markFailure(clean.tenantId, clean.channel, actor, error);
        throw error instanceof ChannelConnectionError
          ? error
          : new ChannelConnectionError("connection_failed", 422, internalError(error));
      }
    },

    async listTenant(tenantId, options) {
      const cleanTenant = cleanTenantId(tenantId);
      if (!cleanTenant) throw new ChannelConnectionError("invalid_channel_request", 400);
      if (typeof store.assertWhatsAppWebhookInboxReady === "function") {
        try { await store.assertWhatsAppWebhookInboxReady(); }
        catch (_) { /* availability below fails closed */ }
      }
      const ownership = await ownershipRows();
      const rows = ownership.filter(function (row) { return row.tenant_id === cleanTenant; });
      const byChannel = new Map(rows.map(function (row) { return [row.channel, row]; }));
      legacyConnections.filter(function (row) { return row.tenant_id === cleanTenant; }).forEach(function (row) {
        byChannel.set(row.channel, preferStoredConnection(byChannel.get(row.channel), row));
      });
      return CHANNEL_CATALOG.map(function (definition) {
        if (!definition.available) {
          return Object.assign({}, definition, {
            tenant_id: cleanTenant,
            channel: definition.id,
            status: "not_connected"
          });
        }
        const effective = effectiveAssetOwner(byChannel.get(definition.id), ownership);
        return Object.assign({}, definition, publicConnection(
          effective || emptyConnection(cleanTenant, definition.id),
          Object.assign({}, options || {}, {
            allowProtectedReconnect: allowProtectedLegacyReconnect(cleanTenant, definition.id),
            whatsappOnboardingAvailable: !!(
              store.supportsAtomicWhatsAppRegistration &&
              store.whatsappOnboardingReady !== false &&
              store.whatsappWebhookInboxReady !== false &&
              store.whatsappPublicOnboardingEnabled !== false &&
              typeof store.bindWhatsAppAttemptAsset === "function" &&
              typeof store.claimWhatsAppRegistration === "function" &&
              typeof store.claimWhatsAppReconciliation === "function" &&
              typeof store.releaseWhatsAppReconciliation === "function" &&
              typeof store.updateWhatsAppAttempt === "function" &&
              typeof store.cancelWhatsAppAttempt === "function"
            ),
            now: now()
          })
        ));
      });
    },

    async listAll(tenants) {
      const rows = await ownershipRows();
      const tenantRows = Array.isArray(tenants) ? tenants : [];
      const tenantMap = new Map(tenantRows.map(function (tenant) {
        return [cleanTenantId(tenant.id || tenant.tenant_id), tenant];
      }));
      const tenantIds = new Set(rows.map(function (row) { return row.tenant_id; }));
      tenantMap.forEach(function (_, id) { if (id) tenantIds.add(id); });
      const result = [];
      tenantIds.forEach(function (tenantId) {
        const tenant = tenantMap.get(tenantId) || {};
        SUPPORTED_CHANNELS.forEach(function (channel) {
          const row = effectiveAssetOwner(rows.find(function (item) {
            return item.tenant_id === tenantId && item.channel === channel;
          }), rows);
          result.push(Object.assign({
            company_name: tenant.company_name || tenant.name || tenantId
          }, publicConnection(row || emptyConnection(tenantId, channel), { superAdmin: true, now: now() })));
        });
      });
      return result.sort(function (left, right) {
        return (left.company_name + ":" + left.channel).localeCompare(right.company_name + ":" + right.channel);
      });
    },

    async begin(tenantId, channel, actor, state, options) {
      const clean = assertTenantChannel(tenantId, channel);
      if (!provider || !provider.configured(clean.channel)) throw new ChannelConnectionError("channel_oauth_not_configured", 503);
      if (clean.channel === "whatsapp" && typeof store.assertWhatsAppOnboardingReady === "function") {
        await store.assertWhatsAppOnboardingReady({ force: true });
      }
      if (clean.channel === "whatsapp" && typeof store.assertWhatsAppWebhookInboxReady === "function") {
        await store.assertWhatsAppWebhookInboxReady({ force: true });
      }
      const legacy = legacyFor(clean.tenantId, clean.channel);
      let storedConnection = null;
      try { storedConnection = await store.get(clean.tenantId, clean.channel); }
      catch (error) { throw mapStoreError(error); }
      // A protected environment fallback must not block a tenant that has a
      // real, encrypted channel record.
      if (legacy && legacy.protected_legacy &&
          (!storedConnection || storedConnection.protected_legacy || !storedConnection.credentials_ciphertext) &&
          !allowProtectedLegacyReconnect(clean.tenantId, clean.channel)) {
        throw new ChannelConnectionError("legacy_connection_protected", 409);
      }
      if (clean.channel === "whatsapp") {
        if (store.whatsappOnboardingReady === false ||
            store.whatsappWebhookInboxReady === false ||
            store.whatsappPublicOnboardingEnabled === false ||
            !store.supportsAtomicWhatsAppRegistration ||
            typeof store.bindWhatsAppAttemptAsset !== "function" ||
            typeof store.claimWhatsAppRegistration !== "function" ||
            typeof store.claimWhatsAppReconciliation !== "function" ||
            typeof store.releaseWhatsAppReconciliation !== "function" ||
            typeof store.updateWhatsAppAttempt !== "function" ||
            typeof store.cancelWhatsAppAttempt !== "function") {
          throw new ChannelConnectionError(
            "channel_store_unavailable",
            503,
            "Atomic WhatsApp onboarding storage is not enabled"
          );
        }
        const attemptId = cleanText(options && options.attemptId, 100);
        if (!attemptId) throw new ChannelConnectionError("invalid_channel_request", 400, "WhatsApp attempt ID is missing");
        if (storedConnection && storedConnection.status === "connected" && storedConnection.credentials_ciphertext) {
          throw new ChannelConnectionError(
            "active_connection_must_be_disconnected",
            409,
            "Disconnect the active WhatsApp connection before connecting another phone"
          );
        }
        if (whatsappAttemptIsActive(storedConnection)) {
          throw new ChannelConnectionError("whatsapp_onboarding_attempt_active", 409);
        }
        const startedAt = iso(now());
        await store.upsert(Object.assign(emptyConnection(clean.tenantId, clean.channel), storedConnection || {}, {
          tenant_id: clean.tenantId,
          channel: clean.channel,
          status: "connecting",
          webhook_status: "not_configured",
          last_error: null,
          last_error_at: null,
          pending_assets: [],
          onboarding_attempt_id: attemptId,
          onboarding_attempt_status: "awaiting_meta",
          onboarding_attempt_started_at: startedAt,
          onboarding_attempt_updated_at: startedAt,
          onboarding_attempt_registration_requested_at: null,
          onboarding_attempt_registration_accepted_at: null,
          onboarding_attempt_subscription_confirmed_at: null,
          onboarding_attempt_phone_number_id: null,
          onboarding_attempt_waba_id: null,
          onboarding_attempt_ciphertext: null,
          onboarding_attempt_last_error: null,
          onboarding_attempt_last_error_at: null,
          onboarding_attempt_reconcile_count: 0,
          onboarding_attempt_reconcile_after: null,
          onboarding_attempt_reconcile_lease_until: null,
          onboarding_attempt_reconcile_owner: null,
          updated_at: startedAt
        }), {
          action: "whatsapp_onboarding_started",
          actor: actorLabel(actor),
          details: { onboarding_attempt_id: attemptId, flow: "new_cloud_api_number" }
        });
      } else {
        await store.upsert({
          tenant_id: clean.tenantId,
          channel: clean.channel,
          status: "connecting",
          last_error: null,
          last_error_at: null,
          pending_assets: [],
          updated_at: iso(now())
        }, {
          action: "connection_started",
          actor: actorLabel(actor),
          details: {}
        });
      }
      return provider.authorizationUrl(clean.channel, state, options);
    },

    async completeAuthorization(input) {
      const clean = assertTenantChannel(input && input.tenant_id, input && input.channel);
      if (clean.channel === "whatsapp") {
        throw new ChannelConnectionError("whatsapp_activation_retired", 410);
      }
      try {
        let accessToken = await provider.exchangeCode(input.code, {
          redirectUri: input && input.redirect_uri,
          channel: clean.channel
        });
        if (clean.channel !== "whatsapp" && typeof provider.extendUserAccessToken === "function") {
          accessToken = await provider.extendUserAccessToken(accessToken);
        }
        const candidates = await provider.discoverAssets(clean.channel, accessToken);
        if (!candidates.length) throw new ChannelConnectionError("no_eligible_assets", 422);
        if (candidates.length === 1) {
          const row = await connectCandidate(clean.tenantId, clean.channel, input.actor, candidates[0]);
          return { status: "connected", connection: publicConnection(row) };
        }
        const pendingAssets = candidates.map(function (candidate) {
          return { id: candidate.id, label: candidate.label, detail: candidate.detail };
        });
        const row = await store.upsert({
          tenant_id: clean.tenantId,
          channel: clean.channel,
          status: "connecting",
          pending_assets: pendingAssets,
          credentials_ciphertext: encryptedCredential({ candidates }),
          credential_source: "oauth_pending",
          last_error: null,
          last_error_at: null,
          updated_at: iso(now())
        }, {
          action: "asset_selection_required",
          actor: actorLabel(input.actor),
          details: { asset_count: pendingAssets.length }
        });
        return { status: "selection_required", connection: publicConnection(row) };
      } catch (error) {
        await markFailure(clean.tenantId, clean.channel, input.actor, error);
        throw error instanceof ChannelConnectionError
          ? error
          : new ChannelConnectionError("connection_failed", 422, internalError(error));
      }
    },

    async completeEmbeddedWhatsApp(input) {
      const clean = assertTenantChannel(input && input.tenant_id, "whatsapp");
      if (!provider || typeof provider.prepareEmbeddedWhatsApp !== "function") {
        throw new ChannelConnectionError("channel_oauth_not_configured", 503);
      }
      const row = await finishWhatsAppAttempt(clean.tenantId, input.actor, {
        attempt_id: input && input.attempt_id,
        code: input && input.code,
        session: input && input.session,
        redirect_uri: input && input.redirect_uri
      });
      const connection = publicConnection(row);
      return { status: connection.status, connection };
    },

    async confirmWhatsAppWebhookDelivery(tenantId, phoneNumberId, actor) {
      const clean = assertTenantChannel(tenantId, "whatsapp");
      const phone = cleanText(phoneNumberId, 240);
      const record = await store.get(clean.tenantId, "whatsapp");
      if (!record || !phone ||
          cleanText(record.onboarding_attempt_phone_number_id, 240) !== phone ||
          !record.onboarding_attempt_registration_requested_at) {
        throw new ChannelConnectionError("connection_not_found", 404);
      }
      if (record.onboarding_attempt_status === "completed" && record.status === "connected") {
        return publicConnection(record, { superAdmin: true });
      }
      if (!whatsappAttemptIsActive(record) ||
          record.onboarding_attempt_status === "registration_rejected") {
        throw new ChannelConnectionError("connection_selection_expired", 409);
      }
      const candidate = onboardingAttemptPayload(record);
      if (!candidate || cleanText(candidate.phone_number_id, 240) !== phone ||
          !cleanText(candidate.access_token, 4096) ||
          !cleanText(candidate.whatsapp_business_account_id, 240)) {
        throw new ChannelConnectionError("existing_asset_credentials_required", 409);
      }
      // A correctly signed `messages` webhook for the claimed phone proves that
      // Meta completed registration and subscribed this app. Promote through the
      // same attempt CAS so the first real customer message is never discarded
      // while a read-only Graph status check is temporarily unavailable.
      const promoted = await promoteWhatsAppAttempt(record, candidate, actor, {
        ok: true,
        account_label: candidate.account_label || candidate.phone_number_id,
        evidence: "signed_messages_webhook"
      });
      return publicConnection(promoted, { superAdmin: true });
    },

    async selectAsset(tenantId, channel, assetId, actor) {
      const clean = assertTenantChannel(tenantId, channel);
      if (clean.channel === "whatsapp") {
        throw new ChannelConnectionError("whatsapp_activation_retired", 410);
      }
      const record = await store.get(clean.tenantId, clean.channel);
      if (!record || record.status !== "connecting" || record.credential_source !== "oauth_pending") {
        throw new ChannelConnectionError("connection_selection_expired", 409);
      }
      const credential = credentialPayload(record);
      const candidate = credential && Array.isArray(credential.candidates)
        ? credential.candidates.find(function (item) { return item.id === cleanText(assetId, 240); })
        : null;
      if (!candidate) throw new ChannelConnectionError("invalid_asset_selection", 400);
      try {
        return publicConnection(await connectCandidate(clean.tenantId, clean.channel, actor, candidate));
      } catch (error) {
        await markFailure(clean.tenantId, clean.channel, actor, error);
        throw error;
      }
    },

    async verify(tenantId, channel, actor, verifyOptions) {
      const clean = assertTenantChannel(tenantId, channel);
      const record = await storedOrLegacy(clean.tenantId, clean.channel);
      if (!record) throw new ChannelConnectionError("connection_not_found", 404);
      if (record.protected_legacy) return publicConnection(record, { superAdmin: true });
      if (clean.channel === "whatsapp" && whatsappAttemptIsActive(record) && record.onboarding_attempt_ciphertext) {
        const resumed = await finishWhatsAppAttempt(clean.tenantId, actor, {
          attempt_id: record.onboarding_attempt_id,
          verification_checks: verifyOptions && verifyOptions.whatsappVerificationChecks,
          verification_interval_ms: verifyOptions && verifyOptions.whatsappVerificationIntervalMs
        });
        return publicConnection(resumed, { superAdmin: true });
      }
      const credential = credentialPayload(record);
      let result = await provider.verify(clean.channel, credential);
      if (!result.ok && result.error === "Meta webhook subscription is missing" &&
          provider && typeof provider.subscribe === "function") {
        try {
          await provider.subscribe(clean.channel, credential);
          result = await provider.verify(clean.channel, credential);
        } catch (error) {
          result = { ok: false, error: internalError(error) };
        }
      }
      const checkedAt = iso(now());
      const activationStillPending = clean.channel === "whatsapp" && !result.ok &&
        (result.pending === true ||
         result.error === "WhatsApp number has not completed Cloud API registration" ||
         result.error === "WhatsApp number is not CONNECTED in Cloud API" ||
         result.error === "Meta is still completing WhatsApp Business App onboarding");
      const definitiveVerificationFailure = /token.*(expir|invalid|revok)|oauth|permission|unsupported get request|does not exist|not found|webhook subscription is missing/i
        .test(String(result && result.error || ""));
      const preserveLastKnownGood = record.status === "connected" && !result.ok &&
        (result.transient === true || (result.transient !== false && !definitiveVerificationFailure));
      const preserveRegistrationCooldown = activationStillPending &&
        !!whatsappActivationRetryAt(record, now());
      const row = await store.upsert({
        tenant_id: clean.tenantId,
        channel: clean.channel,
        status: result.ok || preserveLastKnownGood ? "connected" : activationStillPending ? "connecting" : "needs_attention",
        account_label: result.account_label || record.account_label,
        webhook_status: result.ok ? "subscribed" : preserveLastKnownGood ? record.webhook_status : activationStillPending ? "pending_activation" : "needs_attention",
        last_verified_at: checkedAt,
        last_error: result.ok
          ? null
          : preserveRegistrationCooldown
            ? record.last_error
            : activationStillPending ? null : result.error,
        last_error_at: result.ok
          ? null
          : preserveRegistrationCooldown
            ? record.last_error_at
            : activationStillPending ? null : checkedAt,
        connected_at: result.ok || preserveLastKnownGood ? (record.connected_at || checkedAt) : record.connected_at,
        updated_at: checkedAt
      }, {
        action: result.ok ? "verified" : activationStillPending ? "activation_pending" : "verification_failed",
        actor: actorLabel(actor),
        details: result.ok || activationStillPending ? {} : {
          error: result.error,
          last_known_good_preserved: preserveLastKnownGood
        }
      });
      return publicConnection(row, { superAdmin: true });
    },

    async activateWhatsApp(tenantId, actor, options) {
      const clean = assertTenantChannel(tenantId, "whatsapp");
      const record = await store.get(clean.tenantId, clean.channel);
      if (!record) throw new ChannelConnectionError("connection_not_found", 404);
      // Kept for backwards-compatible callers, but deliberately never invokes
      // /register. Registration only occurs once inside the durable attempt.
      if (whatsappAttemptIsActive(record) && record.onboarding_attempt_ciphertext) {
        return publicConnection(await finishWhatsAppAttempt(clean.tenantId, actor, {
          attempt_id: record.onboarding_attempt_id
        }), { superAdmin: true });
      }
      if (!provider || typeof provider.verify !== "function") {
        return publicConnection(record, { superAdmin: true });
      }
      return this.verify(clean.tenantId, "whatsapp", actor);
    },

    async inspectWhatsApp(tenantId) {
      const clean = assertTenantChannel(tenantId, "whatsapp");
      const record = await store.get(clean.tenantId, clean.channel);
      if (!record) throw new ChannelConnectionError("connection_not_found", 404);
      if (record.protected_legacy) throw new ChannelConnectionError("legacy_connection_protected", 409);
      const credential = credentialPayload(record) || onboardingAttemptPayload(record);
      if (!provider || typeof provider.inspectWhatsApp !== "function" || !credential) {
        throw new ChannelConnectionError("existing_asset_credentials_required", 409);
      }
      const status = await provider.inspectWhatsApp(credential);
      return Object.assign({}, status, {
        configured_mode: cleanWhatsAppOnboardingMode(credential.onboarding_mode) ||
          (credential.coexistence_event_confirmed === true ? "coexistence" : null),
        phone_number_suffix: String(record.phone_number_id || "").slice(-8) || null,
        waba_suffix: String(record.whatsapp_business_account_id || "").slice(-8) || null
      });
    },

    async discardWhatsAppAttempt(tenantId, actor) {
      const clean = assertTenantChannel(tenantId, "whatsapp");
      const record = await store.get(clean.tenantId, clean.channel);
      if (!record) throw new ChannelConnectionError("connection_not_found", 404);
      if (!whatsappAttemptIsActive(record)) {
        return publicConnection(record, { superAdmin: true });
      }
      const activeConnectionExists = record.status === "connected" && !!record.credentials_ciphertext;
      const cancelledAt = iso(now());
      const cancellation = await store.cancelWhatsAppAttempt(
        clean.tenantId,
        record.onboarding_attempt_id,
        {
        status: activeConnectionExists ? "connected" : "not_connected",
        webhook_status: activeConnectionExists ? record.webhook_status : "not_configured",
        account_id: activeConnectionExists ? record.account_id : null,
        account_label: activeConnectionExists ? record.account_label : null,
        meta_business_id: activeConnectionExists ? record.meta_business_id : null,
        whatsapp_business_account_id: activeConnectionExists ? record.whatsapp_business_account_id : null,
        phone_number_id: activeConnectionExists ? record.phone_number_id : null,
        credentials_ciphertext: activeConnectionExists ? record.credentials_ciphertext : null,
        credential_source: activeConnectionExists ? record.credential_source : null,
        onboarding_attempt_status: "cancelled",
        onboarding_attempt_updated_at: cancelledAt,
        onboarding_attempt_phone_number_id: null,
        onboarding_attempt_waba_id: null,
        onboarding_attempt_ciphertext: null,
        onboarding_attempt_last_error: null,
        onboarding_attempt_last_error_at: null,
        onboarding_attempt_reconcile_count: 0,
        onboarding_attempt_reconcile_after: null,
        onboarding_attempt_reconcile_lease_until: null,
        onboarding_attempt_reconcile_owner: null,
        last_error: activeConnectionExists ? record.last_error : null,
        last_error_at: activeConnectionExists ? record.last_error_at : null,
        pending_assets: [],
        updated_at: cancelledAt
        }, {
          action: "whatsapp_onboarding_cancelled",
          actor: actorLabel(actor),
          details: { onboarding_attempt_id: record.onboarding_attempt_id }
        }
      );
      if (!cancellation || !cancellation.cancelled) {
        const current = cancellation && cancellation.row;
        if (current && !whatsappAttemptIsActive(current)) {
          return publicConnection(current, { superAdmin: true });
        }
        throw new ChannelConnectionError(
          "whatsapp_onboarding_cannot_cancel",
          409,
          "Registration already started; the attempt can only be verified"
        );
      }
      return publicConnection(cancellation.row, { superAdmin: true });
    },

    async repairSubscription(tenantId, channel, actor) {
      const clean = assertTenantChannel(tenantId, channel);
      const record = await store.get(clean.tenantId, clean.channel);
      if (!record) throw new ChannelConnectionError("connection_not_found", 404);
      if (record.protected_legacy) throw new ChannelConnectionError("legacy_connection_protected", 409);
      const credential = credentialPayload(record);
      if (!credential || !provider || typeof provider.subscribe !== "function") {
        throw new ChannelConnectionError("existing_asset_credentials_required", 409);
      }
      try {
        await provider.subscribe(clean.channel, credential);
        const result = await provider.verify(clean.channel, credential);
        if (!result.ok) throw new ChannelConnectionError("connection_failed", 422, result.error);
        const checkedAt = iso(now());
        const row = await store.upsert({
          tenant_id: clean.tenantId,
          channel: clean.channel,
          status: "connected",
          account_label: result.account_label || record.account_label,
          webhook_status: "subscribed",
          last_verified_at: checkedAt,
          last_error: null,
          last_error_at: null,
          updated_at: checkedAt
        }, {
          action: "subscription_repaired",
          actor: actorLabel(actor),
          details: {}
        });
        return publicConnection(row, { superAdmin: true });
      } catch (error) {
        await markFailure(clean.tenantId, clean.channel, actor, error);
        throw error instanceof ChannelConnectionError
          ? error
          : new ChannelConnectionError("connection_failed", 422, internalError(error));
      }
    },

    async requestReconnect(tenantId, channel, actor) {
      const clean = assertTenantChannel(tenantId, channel);
      const record = await storedOrLegacy(clean.tenantId, clean.channel);
      if (record && record.protected_legacy) throw new ChannelConnectionError("legacy_connection_protected", 409);
      const row = await store.upsert(Object.assign(emptyConnection(clean.tenantId, clean.channel), record || {}, {
        tenant_id: clean.tenantId,
        channel: clean.channel,
        status: "needs_attention",
        last_error: "Reconnect requested by NextforIA support",
        last_error_at: iso(now()),
        updated_at: iso(now())
      }), {
        action: "reconnect_requested",
        actor: actorLabel(actor),
        details: {}
      });
      return publicConnection(row, { superAdmin: true });
    },

    async disconnect(tenantId, channel, actor) {
      const clean = assertTenantChannel(tenantId, channel);
      const record = await storedOrLegacy(clean.tenantId, clean.channel);
      if (!record) throw new ChannelConnectionError("connection_not_found", 404);
      if (record.protected_legacy) throw new ChannelConnectionError("legacy_connection_protected", 409);
      let providerResult = { ok: true };
      try {
        const credential = credentialPayload(record);
        let sharedWhatsAppSubscription = false;
        if (clean.channel === "whatsapp" && record.whatsapp_business_account_id) {
          const rows = await ownershipRows();
          sharedWhatsAppSubscription = rows.some(function (other) {
            return other && !sameTenant(other.tenant_id, clean.tenantId) &&
              cleanChannel(other.channel) === "whatsapp" &&
              ["connecting", "connected", "needs_attention"].includes(other.status) &&
              String(other.whatsapp_business_account_id || "") === String(record.whatsapp_business_account_id);
          });
        }
        if (credential && provider && !sharedWhatsAppSubscription) {
          providerResult = await provider.disconnect(clean.channel, credential);
        }
      } catch (error) {
        providerResult = { ok: false, error: internalError(error) };
      }
      const disconnectedAt = iso(now());
      const disconnectCompleted = !!providerResult.ok;
      const row = await store.upsert({
        tenant_id: clean.tenantId,
        channel: clean.channel,
        status: disconnectCompleted ? "disconnected" : "needs_attention",
        webhook_status: disconnectCompleted ? "unsubscribed" : "unsubscribe_unconfirmed",
        last_error: disconnectCompleted ? null : providerResult.error,
        last_error_at: disconnectCompleted ? null : disconnectedAt,
        disconnected_at: disconnectCompleted ? disconnectedAt : null,
        disconnected_by: disconnectCompleted ? actorLabel(actor) : null,
        account_id: disconnectCompleted ? null : record.account_id,
        account_label: disconnectCompleted ? null : record.account_label,
        meta_business_id: disconnectCompleted ? null : record.meta_business_id,
        whatsapp_business_account_id: disconnectCompleted ? null : record.whatsapp_business_account_id,
        phone_number_id: disconnectCompleted ? null : record.phone_number_id,
        page_id: disconnectCompleted ? null : record.page_id,
        instagram_user_id: disconnectCompleted ? null : record.instagram_user_id,
        updated_at: disconnectedAt,
        pending_assets: [],
        credentials_ciphertext: disconnectCompleted ? null : record.credentials_ciphertext,
        credential_source: disconnectCompleted ? null : record.credential_source,
        onboarding_attempt_status: disconnectCompleted ? "cancelled" : record.onboarding_attempt_status,
        onboarding_attempt_updated_at: disconnectedAt,
        onboarding_attempt_phone_number_id: disconnectCompleted ? null : record.onboarding_attempt_phone_number_id,
        onboarding_attempt_waba_id: disconnectCompleted ? null : record.onboarding_attempt_waba_id,
        onboarding_attempt_ciphertext: disconnectCompleted ? null : record.onboarding_attempt_ciphertext,
        onboarding_attempt_last_error: disconnectCompleted ? null : record.onboarding_attempt_last_error,
        onboarding_attempt_last_error_at: disconnectCompleted ? null : record.onboarding_attempt_last_error_at,
        onboarding_attempt_reconcile_count: disconnectCompleted ? 0 : record.onboarding_attempt_reconcile_count,
        onboarding_attempt_reconcile_after: disconnectCompleted ? null : record.onboarding_attempt_reconcile_after,
        onboarding_attempt_reconcile_lease_until: disconnectCompleted ? null : record.onboarding_attempt_reconcile_lease_until,
        onboarding_attempt_reconcile_owner: disconnectCompleted ? null : record.onboarding_attempt_reconcile_owner
      }, {
        action: disconnectCompleted ? "disconnected" : "disconnect_failed",
        actor: actorLabel(actor),
        details: {
          provider_unsubscribe_confirmed: disconnectCompleted,
          error: disconnectCompleted ? null : providerResult.error
        }
      });
      if (!disconnectCompleted) {
        throw new ChannelConnectionError("disconnect_failed", 422, providerResult.error);
      }
      return publicConnection(row);
    }
  };
}

module.exports = {
  CHANNEL_CATALOG,
  CONNECTION_STATUSES,
  SUPPORTED_CHANNELS,
  ChannelConnectionError,
  AppendOnlyChannelConnectionStore,
  InMemoryChannelConnectionStore,
  MigratingChannelConnectionStore,
  MetaChannelProvider,
  SupabaseChannelConnectionStore,
  cleanChannel,
  cleanTenantId,
  createChannelConnectionService,
  createLegacyConnections,
  createOAuthState,
  emptyConnection,
  publicConnection,
  readOAuthState
};
