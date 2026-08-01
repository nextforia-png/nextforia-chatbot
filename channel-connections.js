"use strict";

const crypto = require("crypto");
const { decryptStoredText, encryptStoredText, safeEqualText } = require("./security");

const SUPPORTED_CHANNELS = ["whatsapp", "instagram", "messenger"];
const CONNECTION_STATUSES = ["not_connected", "connecting", "connected", "needs_attention", "disconnected"];
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
  const message = data && data.error && (data.error.message || data.error.type) ||
    data && data.message ||
    error && error.internalMessage ||
    error && error.message ||
    "meta_connection_failed";
  return cleanText(message, 800);
}

function mapStoreError(error) {
  if (error instanceof ChannelConnectionError) return error;
  const status = error && error.response && error.response.status;
  const detail = internalError(error);
  if (status === 404) return new ChannelConnectionError("connection_not_found", 404, detail);
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
    protected_legacy: false
  };
}

function publicConnection(record, options) {
  const safe = Object.assign(emptyConnection(record && record.tenant_id, record && record.channel), record || {});
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
  const allowProtectedReconnect = !!(options && options.allowProtectedReconnect);
  const reconnectAllowed = !safe.protected_legacy || allowProtectedReconnect;
  delete safe.credentials_ciphertext;
  delete safe.credential_source;
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
  safe.disconnect_available = !safe.protected_legacy && ["connected", "needs_attention", "connecting"].includes(safe.status);
  safe.reconnect_available = reconnectAllowed && (
    ["connected", "needs_attention", "disconnected"].includes(safe.status)
    || (safe.status === "connecting" && safe.pending_assets.length === 0)
  );
  safe.connect_available = !safe.protected_legacy && ["not_connected", "disconnected"].includes(safe.status);
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
    v: 1,
    tenant_id: cleanTenantId(input && input.tenant_id),
    channel: cleanChannel(input && input.channel),
    actor_id: cleanText(input && input.actor_id, 200),
    actor: cleanText(input && input.actor, 200),
    redirect_uri: cleanText(input && input.redirect_uri, 500),
    return_path: cleanText(input && input.return_path, 500),
    return_mode: input && input.return_mode === "popup" ? "popup" : "",
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
    if (payload.v !== 1 || !payload.exp || payload.exp < Number(now || Date.now())) return null;
    payload.tenant_id = cleanTenantId(payload.tenant_id);
    payload.channel = cleanChannel(payload.channel);
    payload.redirect_uri = cleanText(payload.redirect_uri, 500);
    payload.return_mode = payload.return_mode === "popup" ? "popup" : "";
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
}

class AppendOnlyChannelConnectionStore {
  constructor(options) {
    options = options || {};
    this.loadLatest = options.loadLatest;
    this.loadAll = options.loadAll;
    this.append = options.append;
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
      const response = await this.axios.get(this.url + "/rest/v1/tenant_channel_connections", {
        params: { select: "*", order: "tenant_id.asc,channel.asc" },
        headers: this.headers,
        timeout: 8000
      });
      return Array.isArray(response.data) ? response.data : [];
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
      if (event) {
        await this.axios.post(this.url + "/rest/v1/tenant_channel_connection_audit", {
          tenant_id: payload.tenant_id,
          channel: payload.channel,
          action: cleanText(event.action, 80),
          actor: cleanText(event.actor, 200),
          details: event.details || {}
        }, {
          headers: Object.assign({ Prefer: "return=minimal" }, this.headers),
          timeout: 8000
        });
      }
      return row;
    } catch (error) {
      throw mapStoreError(error);
    }
  }
}

class MetaChannelProvider {
  constructor(options) {
    options = options || {};
    this.appId = cleanText(options.appId, 160);
    this.appSecret = cleanText(options.appSecret, 400);
    this.whatsappConfigId = cleanText(options.whatsappConfigId, 240);
    this.graphVersion = cleanText(options.graphVersion, 20) || "v23.0";
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
      url.searchParams.set("force_authentication", "1");
      url.searchParams.set("force_reauth", "true");
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

  whatsappRegistrationPin(phoneNumberId) {
    const digest = crypto.createHmac("sha256", this.appSecret)
      .update("whatsapp-cloud-registration:" + cleanText(phoneNumberId, 240))
      .digest();
    return String(digest.readUInt32BE(0) % 1000000).padStart(6, "0");
  }

  async exchangeCode(code, options) {
    const redirectUri = cleanText(options && options.redirectUri || this.redirectUri, 500);
    if (!redirectUri) throw new ChannelConnectionError("channel_oauth_not_configured", 503);
    if (cleanChannel(options && options.channel) === "instagram" && this.instagramLoginEnabled) {
      try {
        const form = new URLSearchParams();
        form.set("client_id", this.instagramAppId);
        form.set("client_secret", this.instagramAppSecret);
        form.set("grant_type", "authorization_code");
        form.set("redirect_uri", redirectUri);
        form.set("code", cleanText(code, 2000));
        const response = await this.axios.post(this.instagramApiOrigin + "/oauth/access_token", form.toString(), {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10000
        });
        const token = cleanText(response.data && response.data.access_token, 4096);
        if (!token) throw new Error("Instagram did not return an access token");
        return { access_token: token, login_type: "instagram" };
      } catch (error) {
        throw new ChannelConnectionError("invalid_authorization", 422, internalError(error));
      }
    }
    try {
      const response = await this.axios.get(this.graphOrigin + "/" + this.graphVersion + "/oauth/access_token", {
        params: {
          client_id: this.appId,
          client_secret: this.appSecret,
          redirect_uri: redirectUri,
          code: cleanText(code, 2000)
        },
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
    try {
      if (channel === "whatsapp") {
        await this.subscribe(channel, candidate);
        // Existing WhatsApp Business App numbers use Meta's coexistence flow.
        // Meta rejects /register for these SMB assets because Embedded Signup
        // already performs the phone verification and Cloud API bridge.
        if (!candidate.coexistence) {
          await this.graph(encodeURIComponent(candidate.phone_number_id) + "/register", candidate.access_token, {
            method: "POST",
            data: {
              messaging_product: "whatsapp",
              pin: this.whatsappRegistrationPin(candidate.phone_number_id)
            }
          });
        }
        const verified = await this.graph(encodeURIComponent(candidate.phone_number_id), candidate.access_token, {
          params: {
            fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type"
          }
        });
        const registrationReady =
          String(verified.data && verified.data.code_verification_status || "").toUpperCase() === "VERIFIED" &&
          String(verified.data && verified.data.platform_type || "").toUpperCase() === "CLOUD_API";
        if (!registrationReady) {
          throw new ChannelConnectionError(
            "asset_activation_failed",
            422,
            "WhatsApp number has not completed Cloud API registration"
          );
        }
        candidate.account_label = cleanText(
          verified.data && (verified.data.display_phone_number || verified.data.verified_name) || candidate.account_label,
          240
        );
      } else {
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
      }
      return candidate;
    } catch (error) {
      throw new ChannelConnectionError("asset_activation_failed", 422, internalError(error));
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
          ? "messages,messaging_postbacks,message_reactions,message_reads"
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
    const phoneNumberId = cleanText(session && session.phone_number_id, 240);
    const businessId = cleanText(session && session.business_id, 240);
    if (!wabaId || !phoneNumberId) {
      throw new ChannelConnectionError("invalid_authorization", 422, "Embedded Signup did not return the WhatsApp asset IDs");
    }
    const accessToken = await this.exchangeCode(code, options);
    try {
      const phones = await this.graph(encodeURIComponent(wabaId) + "/phone_numbers", accessToken, {
        params: { fields: "id,display_phone_number,verified_name,quality_rating", limit: 100 }
      });
      const phone = (phones.data && phones.data.data || []).find(function (item) {
        return String(item && item.id) === phoneNumberId;
      });
      if (!phone) {
        throw new ChannelConnectionError("invalid_authorization", 422, "The selected phone number does not belong to the selected WhatsApp account");
      }
      return {
        id: "wa:" + phoneNumberId,
        account_id: phoneNumberId,
        account_label: cleanText(phone.display_phone_number || phone.verified_name || phoneNumberId, 240),
        meta_business_id: businessId || null,
        whatsapp_business_account_id: wabaId,
        phone_number_id: phoneNumberId,
        access_token: accessToken,
        coexistence: true
      };
    } catch (error) {
      if (error instanceof ChannelConnectionError) throw error;
      throw new ChannelConnectionError("invalid_authorization", 422, internalError(error));
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
        ? "id,display_phone_number,verified_name,code_verification_status,platform_type"
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
      const expectedAppId = directInstagram ? this.instagramAppId : this.appId;
      const appSubscribed = subscribedApps.some((app) => String(
        app && (app.id || app.whatsapp_business_api_data && app.whatsapp_business_api_data.id)
      ) === String(expectedAppId));
      const registrationReady = channel !== "whatsapp" || (
        String(verified.data && verified.data.code_verification_status || "").toUpperCase() === "VERIFIED" &&
        String(verified.data && verified.data.platform_type || "").toUpperCase() === "CLOUD_API"
      );
      return {
        ok: !!(verified.data && String(verified.data.id) === String(targetId) && appSubscribed && registrationReady),
        account_label: cleanText(
          verified.data && (verified.data.display_phone_number || verified.data.username && "@" + verified.data.username || verified.data.name),
          240
        ),
        error: !appSubscribed
          ? "Meta webhook subscription is missing"
          : !registrationReady
            ? "WhatsApp number has not completed Cloud API registration"
            : null
      };
    } catch (error) {
      return { ok: false, error: internalError(error) };
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
  const now = typeof options.now === "function" ? options.now : function () { return new Date(); };
  const tenantAliases = options.tenantAliases && typeof options.tenantAliases === "object"
    ? options.tenantAliases
    : {};

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
    const conflict = rows.find(function (row) {
      if (!row || sameTenant(row.tenant_id, tenantId) || cleanChannel(row.channel) !== channel) return false;
      if (!["connecting", "connected", "needs_attention"].includes(row.status)) return false;
      const existingKeys = assetIdentityKeys(channel, row);
      return existingKeys.some(function (key) { return candidateKeys.includes(key); });
    });
    if (conflict) {
      throw new ChannelConnectionError(
        "channel_asset_already_assigned",
        409,
        "Channel asset is already assigned to another tenant"
      );
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
    return store.upsert(Object.assign(emptyConnection(tenantId, channel), existing || {}, {
      tenant_id: tenantId,
      channel,
      status: "needs_attention",
      last_error: internalError(error),
      last_error_at: iso(now()),
      updated_at: iso(now()),
      pending_assets: []
    }), {
      action: "connection_failed",
      actor: actorLabel(actor),
      details: { error: internalError(error) }
    });
  }

  async function connectCandidate(tenantId, channel, actor, candidate) {
    // Check before subscribing so an OAuth callback cannot attach the same
    // Instagram/Page/phone asset to two tenants.
    await assertAssetAvailable(tenantId, channel, candidate);
    const activated = await provider.activate(channel, candidate);
    const connectedAt = iso(now());
    return store.upsert({
      tenant_id: tenantId,
      channel,
      status: "connected",
      account_id: activated.account_id,
      account_label: activated.account_label,
      meta_business_id: activated.meta_business_id || null,
      whatsapp_business_account_id: activated.whatsapp_business_account_id || null,
      phone_number_id: activated.phone_number_id || null,
      page_id: activated.page_id || null,
      instagram_user_id: activated.instagram_user_id || null,
      webhook_status: "subscribed",
      last_verified_at: connectedAt,
      last_error: null,
      last_error_at: null,
      connected_at: connectedAt,
      disconnected_at: null,
      connected_by: actorLabel(actor),
      disconnected_by: null,
      protected_legacy: false,
      updated_at: connectedAt,
      pending_assets: [],
      credentials_ciphertext: encryptedCredential({
        access_token: activated.access_token,
        login_type: activated.login_type || null,
        meta_business_id: activated.meta_business_id || null,
        whatsapp_business_account_id: activated.whatsapp_business_account_id || null,
        phone_number_id: activated.phone_number_id || null,
        page_id: activated.page_id || null,
        instagram_user_id: activated.instagram_user_id || null
      }),
      credential_source: "oauth",
      protected_legacy: false
    }, {
      action: "connected",
      actor: actorLabel(actor),
      details: { account_id: activated.account_id, account_label: activated.account_label }
    });
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
            allowProtectedReconnect: allowProtectedLegacyReconnect(cleanTenant, definition.id)
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
          }, publicConnection(row || emptyConnection(tenantId, channel), { superAdmin: true })));
        });
      });
      return result.sort(function (left, right) {
        return (left.company_name + ":" + left.channel).localeCompare(right.company_name + ":" + right.channel);
      });
    },

    async begin(tenantId, channel, actor, state, options) {
      const clean = assertTenantChannel(tenantId, channel);
      if (!provider || !provider.configured(clean.channel)) throw new ChannelConnectionError("channel_oauth_not_configured", 503);
      const legacy = legacyFor(clean.tenantId, clean.channel);
      let storedConnection = null;
      try { storedConnection = await store.get(clean.tenantId, clean.channel); }
      catch (error) { throw mapStoreError(error); }
      // A protected environment fallback must not block Embedded Signup once
      // the tenant has a real, encrypted channel record. This is how an
      // existing WhatsApp Business App number completes coexistence safely.
      if (legacy && legacy.protected_legacy &&
          (!storedConnection || storedConnection.protected_legacy || !storedConnection.credentials_ciphertext) &&
          !allowProtectedLegacyReconnect(clean.tenantId, clean.channel)) {
        throw new ChannelConnectionError("legacy_connection_protected", 409);
      }
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
      return provider.authorizationUrl(clean.channel, state, options);
    },

    async completeAuthorization(input) {
      const clean = assertTenantChannel(input && input.tenant_id, input && input.channel);
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
      try {
        const candidate = await provider.prepareEmbeddedWhatsApp(
          input && input.code,
          input && input.session,
          { redirectUri: input && input.redirect_uri }
        );
        const row = await connectCandidate(clean.tenantId, clean.channel, input.actor, candidate);
        return { status: "connected", connection: publicConnection(row) };
      } catch (error) {
        await markFailure(clean.tenantId, clean.channel, input.actor, error);
        throw error instanceof ChannelConnectionError
          ? error
          : new ChannelConnectionError("connection_failed", 422, internalError(error));
      }
    },

    async selectAsset(tenantId, channel, assetId, actor) {
      const clean = assertTenantChannel(tenantId, channel);
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

    async verify(tenantId, channel, actor) {
      const clean = assertTenantChannel(tenantId, channel);
      const record = await storedOrLegacy(clean.tenantId, clean.channel);
      if (!record) throw new ChannelConnectionError("connection_not_found", 404);
      if (record.protected_legacy) return publicConnection(record, { superAdmin: true });
      const credential = credentialPayload(record);
      const result = await provider.verify(clean.channel, credential);
      const checkedAt = iso(now());
      const row = await store.upsert({
        tenant_id: clean.tenantId,
        channel: clean.channel,
        status: result.ok ? "connected" : "needs_attention",
        account_label: result.account_label || record.account_label,
        webhook_status: result.ok ? "subscribed" : "needs_attention",
        last_verified_at: checkedAt,
        last_error: result.ok ? null : result.error,
        last_error_at: result.ok ? null : checkedAt,
        updated_at: checkedAt
      }, {
        action: result.ok ? "verified" : "verification_failed",
        actor: actorLabel(actor),
        details: result.ok ? {} : { error: result.error }
      });
      return publicConnection(row, { superAdmin: true });
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
        if (credential && provider) providerResult = await provider.disconnect(clean.channel, credential);
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
        credential_source: disconnectCompleted ? null : record.credential_source
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
