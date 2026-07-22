"use strict";

const crypto = require("crypto");

class CustomerAccessError extends Error {
  constructor(code, status, details) {
    super(code);
    this.name = "CustomerAccessError";
    this.code = code;
    this.status = status || 400;
    this.details = details || null;
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function validateCreateInput(input) {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const allowed = ["company_name", "admin_email", "plan_id", "assigned_bot_id"];
  const keys = Object.keys(body);
  if (keys.some(function (key) { return !allowed.includes(key); }) || allowed.some(function (key) { return !keys.includes(key); })) {
    throw new CustomerAccessError("invalid_request", 400);
  }
  const companyName = String(body.company_name || "").trim().replace(/\s+/g, " ");
  const adminEmail = normalizeEmail(body.admin_email);
  const planId = cleanIdentifier(body.plan_id);
  const assignedBotId = cleanIdentifier(body.assigned_bot_id);
  if (companyName.length < 2 || companyName.length > 120) throw new CustomerAccessError("invalid_company_name", 400);
  if (!validEmail(adminEmail)) throw new CustomerAccessError("invalid_email", 400);
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(planId)) throw new CustomerAccessError("invalid_plan", 400);
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(assignedBotId)) throw new CustomerAccessError("invalid_assigned_bot", 400);
  return { company_name: companyName, admin_email: adminEmail, plan_id: planId, assigned_bot_id: assignedBotId };
}

function validatePassword(password, confirmation) {
  const value = String(password || "");
  if (value.length < 12 || value.length > 128 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(value) || !/\d/.test(value)) {
    throw new CustomerAccessError("weak_password", 400);
  }
  if (value !== String(confirmation || "")) throw new CustomerAccessError("password_mismatch", 400);
  return value;
}

function hashInvitationToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password || ""), salt, 64).toString("base64url");
}

function invitationStatus(invitation, now) {
  if (invitation.revoked_at) return "revoked";
  if (invitation.used_at) return "used";
  if (new Date(invitation.expires_at).getTime() <= now.getTime()) return "expired";
  if (invitation.delivery_status === "failed") return "delivery_failed";
  if (invitation.delivery_status === "sent") return "sent";
  return "pending_delivery";
}

function publicInvitation(row, now) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    company_name: row.company_name,
    admin_email: row.email_normalized,
    plan_id: row.plan_id,
    assigned_bot_id: row.assigned_bot_id,
    role: row.role || "admin",
    status: invitationStatus(row, now),
    delivery_status: row.delivery_status || "pending",
    delivery_error: row.delivery_error || null,
    created_at: row.created_at,
    expires_at: row.expires_at,
    delivered_at: row.delivered_at || null,
    used_at: row.used_at || null,
    revoked_at: row.revoked_at || null
  };
}

function mapStoreError(error) {
  if (error instanceof CustomerAccessError) return error;
  const source = String(error && (error.code || error.message) || "");
  const known = {
    INVALID_PLAN: ["invalid_plan", 400],
    INVALID_ASSIGNED_BOT: ["invalid_assigned_bot", 400],
    CUSTOMER_ALREADY_EXISTS: ["customer_already_exists", 409],
    INVALID_INVITATION: ["invalid_invitation", 403],
    INVITATION_EXPIRED: ["invitation_expired", 410],
    INVITATION_REVOKED: ["invitation_revoked", 409],
    INVITATION_ALREADY_USED: ["invitation_already_used", 409]
  };
  const key = Object.keys(known).find(function (candidate) { return source.includes(candidate); });
  if (key) return new CustomerAccessError(known[key][0], known[key][1]);
  return new CustomerAccessError("customer_access_unavailable", 503);
}

class SupabaseCustomerAccessStore {
  constructor(options) {
    this.url = String(options.url || "").replace(/\/$/, "");
    this.headers = Object.assign({}, options.headers || {});
    this.axios = options.axiosClient;
  }

  async rpc(name, payload) {
    try {
      const response = await this.axios.post(this.url + "/rest/v1/rpc/" + name, payload, {
        headers: Object.assign({ Prefer: "return=representation" }, this.headers),
        timeout: 8000
      });
      return Array.isArray(response.data) ? response.data : response.data == null ? [] : [response.data];
    } catch (error) {
      throw mapStoreError(error && error.response && error.response.data || error);
    }
  }

  async catalogs() {
    const rows = await this.rpc("platform_customer_access_catalogs_v2", {});
    const payload = rows[0] || {};
    return { plans: payload.plans || [], bots: payload.bots || [] };
  }

  async createInvitation(input) {
    const rows = await this.rpc("platform_create_customer_invitation_v2", {
      p_company_name: input.company_name,
      p_admin_email: input.admin_email,
      p_plan_id: input.plan_id,
      p_assigned_bot_id: input.assigned_bot_id,
      p_token_hash: input.token_hash,
      p_expires_at: input.expires_at,
      p_created_by: input.created_by
    });
    if (!rows[0]) throw new CustomerAccessError("customer_access_unavailable", 503);
    return rows[0];
  }

  async updateDelivery(input) {
    const rows = await this.rpc("platform_update_invitation_delivery_v2", {
      p_invitation_id: input.invitation_id,
      p_delivery_status: input.delivery_status,
      p_provider_message_id: input.provider_message_id || null,
      p_delivery_error: input.delivery_error || null
    });
    return rows[0] || null;
  }

  async getInvitation(input) {
    const rows = await this.rpc("platform_get_customer_invitation_v2", {
      p_tenant_id: input.tenant_id,
      p_token_hash: input.token_hash
    });
    if (!rows[0]) throw new CustomerAccessError("invalid_invitation", 403);
    return rows[0];
  }

  async consumeInvitation(input) {
    const rows = await this.rpc("platform_consume_customer_invitation_v2", {
      p_tenant_id: input.tenant_id,
      p_token_hash: input.token_hash,
      p_password_hash: input.password_hash,
      p_password_salt: input.password_salt
    });
    if (!rows[0]) throw new CustomerAccessError("invalid_invitation", 403);
    return rows[0];
  }

  async activeUserByEmail(email) {
    const rows = await this.rpc("platform_active_tenant_user_by_email_v2", { p_email: normalizeEmail(email) });
    return rows[0] || null;
  }

  async listInvitations() {
    return this.rpc("platform_list_customer_invitations_v2", {});
  }

  async revokeInvitation(invitationId, actor) {
    const rows = await this.rpc("platform_revoke_customer_invitation_v2", {
      p_invitation_id: invitationId,
      p_actor: actor
    });
    if (!rows[0]) throw new CustomerAccessError("invalid_invitation", 403);
    return rows[0];
  }
}

class InMemoryCustomerAccessStore {
  constructor(options) {
    options = options || {};
    this.plans = options.plans || [
      { id: "starter", name: "Starter", active: true },
      { id: "growth", name: "Growth", active: true },
      { id: "scale", name: "Scale", active: true }
    ];
    this.bots = options.bots || [
      { id: "atencion-cliente", name: "Atención al cliente", active: true },
      { id: "agendamiento", name: "Agendamiento", active: true },
      { id: "commerce", name: "Commerce", active: true }
    ];
    this.tenants = [];
    this.users = [];
    this.invitations = [];
    this.audit = [];
    this.now = typeof options.now === "function" ? options.now : function () { return new Date(); };
  }

  setNow(now) {
    if (typeof now === "function") this.now = now;
  }

  seedActiveUser(input) {
    const email = normalizeEmail(input && input.email);
    const tenantId = cleanIdentifier(input && input.tenant_id);
    const companyName = String(input && input.company_name || tenantId).trim();
    const password = String(input && input.password || "");
    if (!validEmail(email) || !tenantId || !companyName || !password) throw new Error("invalid_test_fixture");
    const tenant = this.tenants.find(function (row) { return row.id === tenantId; }) || {
      id: tenantId,
      company_name: companyName,
      plan_id: "growth",
      assigned_bot_id: "atencion-cliente",
      status: "setup",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (!this.tenants.some(function (row) { return row.id === tenantId; })) this.tenants.push(tenant);
    const suppliedSalt = String(input.password_salt || "");
    const suppliedHash = String(input.password_hash || "");
    const salt = suppliedSalt ? Buffer.from(suppliedSalt, "base64url") : crypto.randomBytes(16);
    const user = {
      user_id: String(input.user_id || crypto.randomUUID()),
      tenant_id: tenantId,
      email_normalized: email,
      role: input.role || "admin",
      status: "active",
      active: input.active !== false,
      password_hash: suppliedHash || hashPassword(password, salt),
      password_salt: salt.toString("base64url"),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.users.push(user);
    return Object.assign({}, user, { company_name: companyName });
  }

  seedInvitation(input) {
    const email = normalizeEmail(input && input.email);
    const tenantId = cleanIdentifier(input && input.tenant_id);
    const companyName = String(input && input.company_name || tenantId).trim();
    const token = String(input && input.token || "");
    if (!validEmail(email) || !tenantId || !companyName || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("invalid_test_invitation_fixture");
    const now = new Date().toISOString();
    if (!this.tenants.some(function (row) { return row.id === tenantId; })) {
      this.tenants.push({ id: tenantId, company_name: companyName, plan_id: "growth", assigned_bot_id: "atencion-cliente", status: "setup", created_at: now, updated_at: now });
    }
    const user = {
      user_id: String(input.user_id || crypto.randomUUID()),
      tenant_id: tenantId,
      email_normalized: email,
      role: "admin",
      status: "pending",
      active: false,
      password_hash: null,
      password_salt: null,
      created_at: now,
      updated_at: now
    };
    const invitation = {
      id: String(input.invitation_id || crypto.randomUUID()),
      tenant_id: tenantId,
      tenant_user_id: user.user_id,
      email_normalized: email,
      company_name: companyName,
      plan_id: "growth",
      assigned_bot_id: "atencion-cliente",
      role: "admin",
      token_hash: hashInvitationToken(token),
      delivery_status: "sent",
      created_by: "test-fixture",
      created_at: now,
      expires_at: input.expires_at || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      delivered_at: now,
      used_at: input.used_at || null,
      revoked_at: input.revoked_at || null
    };
    this.users.push(user);
    this.invitations.push(invitation);
    return Object.assign({}, invitation, { token: undefined });
  }

  async catalogs() {
    return {
      plans: this.plans.filter(function (row) { return row.active; }),
      bots: this.bots.filter(function (row) { return row.active; })
    };
  }

  async createInvitation(input) {
    if (!this.plans.some(function (row) { return row.id === input.plan_id && row.active; })) throw new CustomerAccessError("invalid_plan", 400);
    if (!this.bots.some(function (row) { return row.id === input.assigned_bot_id && row.active; })) throw new CustomerAccessError("invalid_assigned_bot", 400);
    if (this.users.some(function (row) { return row.email_normalized === input.admin_email; })) throw new CustomerAccessError("customer_already_exists", 409);
    const slug = input.company_name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "cliente";
    if (this.tenants.some(function (row) { return row.company_name.toLowerCase() === input.company_name.toLowerCase(); })) throw new CustomerAccessError("customer_already_exists", 409);
    const now = new Date().toISOString();
    const tenant = { id: slug + "-" + crypto.randomBytes(3).toString("hex"), company_name: input.company_name, plan_id: input.plan_id, assigned_bot_id: input.assigned_bot_id, status: "setup", created_at: now, updated_at: now };
    const user = { user_id: crypto.randomUUID(), tenant_id: tenant.id, email_normalized: input.admin_email, role: "admin", status: "pending", active: false, password_hash: null, password_salt: null, created_at: now, updated_at: now };
    const invitation = { id: crypto.randomUUID(), tenant_id: tenant.id, tenant_user_id: user.user_id, email_normalized: input.admin_email, company_name: tenant.company_name, plan_id: tenant.plan_id, assigned_bot_id: tenant.assigned_bot_id, role: "admin", token_hash: input.token_hash, delivery_status: "pending", delivery_error: null, provider_message_id: null, created_by: input.created_by, created_at: now, expires_at: input.expires_at, delivered_at: null, used_at: null, revoked_at: null };
    this.tenants.push(tenant);
    this.users.push(user);
    this.invitations.push(invitation);
    this.audit.push({ action: "tenant_invitation_created", tenant_id: tenant.id, invitation_id: invitation.id, actor: input.created_by, created_at: now });
    return Object.assign({}, invitation, { tenant_status: tenant.status, membership_status: user.status });
  }

  async updateDelivery(input) {
    const row = this.invitations.find(function (item) { return item.id === input.invitation_id; });
    if (!row) throw new CustomerAccessError("invalid_invitation", 403);
    row.delivery_status = input.delivery_status;
    row.provider_message_id = input.provider_message_id || null;
    row.delivery_error = input.delivery_error ? String(input.delivery_error).slice(0, 160) : null;
    row.delivered_at = input.delivery_status === "sent" ? new Date().toISOString() : null;
    this.audit.push({ action: input.delivery_status === "sent" ? "invitation_delivered" : "invitation_delivery_failed", tenant_id: row.tenant_id, invitation_id: row.id, created_at: new Date().toISOString() });
    return row;
  }

  async getInvitation(input) {
    const row = this.invitations.find(function (item) { return item.tenant_id === input.tenant_id && item.token_hash === input.token_hash; });
    if (!row) throw new CustomerAccessError("invalid_invitation", 403);
    return Object.assign({}, row);
  }

  async consumeInvitation(input) {
    const row = this.invitations.find(function (item) { return item.tenant_id === input.tenant_id && item.token_hash === input.token_hash; });
    if (!row) throw new CustomerAccessError("invalid_invitation", 403);
    const status = invitationStatus(row, this.now());
    if (status === "used") throw new CustomerAccessError("invitation_already_used", 409);
    if (status === "revoked") throw new CustomerAccessError("invitation_revoked", 409);
    if (status === "expired") throw new CustomerAccessError("invitation_expired", 410);
    const user = this.users.find(function (item) { return item.user_id === row.tenant_user_id && item.tenant_id === row.tenant_id; });
    const now = new Date().toISOString();
    row.used_at = now;
    user.password_hash = input.password_hash;
    user.password_salt = input.password_salt;
    user.status = "active";
    user.active = true;
    user.updated_at = now;
    this.audit.push({ action: "invitation_consumed", tenant_id: row.tenant_id, invitation_id: row.id, actor: user.user_id, created_at: now });
    return { user_id: user.user_id, tenant_id: user.tenant_id, email_normalized: user.email_normalized, role: user.role, company_name: row.company_name };
  }

  async activeUserByEmail(email) {
    const normalized = normalizeEmail(email);
    const row = this.users.find(function (item) { return item.email_normalized === normalized && item.active && item.status === "active"; });
    if (!row) return null;
    const tenant = this.tenants.find(function (item) { return item.id === row.tenant_id; });
    return Object.assign({}, row, { company_name: tenant ? tenant.company_name : null });
  }

  async listInvitations() {
    return this.invitations.map(function (row) { return Object.assign({}, row, { token_hash: undefined }); });
  }

  async revokeInvitation(invitationId, actor) {
    const row = this.invitations.find(function (item) { return item.id === invitationId; });
    if (!row) throw new CustomerAccessError("invalid_invitation", 403);
    if (row.used_at) throw new CustomerAccessError("invitation_already_used", 409);
    if (!row.revoked_at) {
      row.revoked_at = new Date().toISOString();
      this.audit.push({ action: "invitation_revoked", tenant_id: row.tenant_id, invitation_id: row.id, actor: actor, created_at: row.revoked_at });
    }
    return Object.assign({}, row);
  }
}

function createResendEmailSender(options) {
  const apiKey = String(options.apiKey || "");
  const from = String(options.from || "");
  const replyTo = String(options.replyTo || "");
  const axiosClient = options.axiosClient;
  return {
    async sendInvitation(message) {
      const response = await axiosClient.post("https://api.resend.com/emails", {
        from: from,
        to: [message.to],
        reply_to: replyTo || undefined,
        subject: "Crea tu acceso a Nextfor IA",
        text: "Hola. " + message.company_name + " fue creado en Nextfor IA. Define tu contraseña usando este enlace privado (vence el " + message.expires_at + "): " + message.setup_url,
        html: "<p>Hola.</p><p><strong>" + escapeHtml(message.company_name) + "</strong> fue creado en Nextfor IA.</p><p><a href=\"" + escapeHtml(message.setup_url) + "\">Crear mi contraseña</a></p><p>Este enlace es privado, de un solo uso y vence el " + escapeHtml(message.expires_at) + ".</p>"
      }, {
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        timeout: 8000
      });
      return { id: response.data && response.data.id || null };
    }
  };
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function createMemoryEmailSender() {
  const outbox = [];
  return {
    outbox: outbox,
    async sendInvitation(message) {
      outbox.push(Object.assign({}, message));
      return { id: "test-email-" + outbox.length };
    }
  };
}

function createCustomerAccessService(options) {
  const store = options.store;
  const emailSender = options.emailSender;
  const baseUrl = String(options.baseUrl || "").replace(/\/$/, "");
  const ttlHours = Math.max(1, Math.min(168, Number(options.inviteTtlHours) || 24));
  const now = typeof options.now === "function" ? options.now : function () { return new Date(); };
  if (store && typeof store.setNow === "function") store.setNow(now);

  async function inspectInvitation(tenantId, token) {
    const cleanTenant = String(tenantId || "").trim().toLowerCase();
    const cleanToken = String(token || "");
    if (!/^[A-Za-z0-9_-]{43}$/.test(cleanToken)) throw new CustomerAccessError("invalid_invitation", 403);
    let row;
    try { row = await store.getInvitation({ tenant_id: cleanTenant, token_hash: hashInvitationToken(cleanToken) }); }
    catch (error) { throw mapStoreError(error); }
    const status = invitationStatus(row, now());
    if (status === "used") throw new CustomerAccessError("invitation_already_used", 409);
    if (status === "revoked") throw new CustomerAccessError("invitation_revoked", 409);
    if (status === "expired") throw new CustomerAccessError("invitation_expired", 410);
    return { id: row.id, tenant_id: row.tenant_id, company_name: row.company_name, email: row.email_normalized, role: row.role || "admin", expires_at: row.expires_at };
  }

  return {
    async catalogs() {
      try { return await store.catalogs(); }
      catch (error) { throw mapStoreError(error); }
    },

    async createInvitation(input, actor) {
      const clean = validateCreateInput(input);
      const token = crypto.randomBytes(32).toString("base64url");
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
      let created;
      try {
        created = await store.createInvitation(Object.assign({}, clean, {
          token_hash: hashInvitationToken(token),
          expires_at: expiresAt,
          created_by: String(actor && (actor.user_id || actor.email || actor.username) || "super_admin").slice(0, 160)
        }));
      } catch (error) {
        throw mapStoreError(error);
      }
      const setupUrl = baseUrl + "/admin/setup/" + encodeURIComponent(created.tenant_id) + "?invite=" + encodeURIComponent(token);
      try {
        const delivery = await emailSender.sendInvitation({ to: clean.admin_email, company_name: clean.company_name, setup_url: setupUrl, expires_at: expiresAt });
        const updated = await store.updateDelivery({ invitation_id: created.id, delivery_status: "sent", provider_message_id: delivery && delivery.id || null });
        return {
          tenant: { id: created.tenant_id, company_name: clean.company_name, plan_id: clean.plan_id, assigned_bot_id: clean.assigned_bot_id, status: created.tenant_status || "setup" },
          membership: { email: clean.admin_email, role: "admin", status: created.membership_status || "pending" },
          invitation: publicInvitation(Object.assign({}, created, updated || {}, { company_name: clean.company_name, email_normalized: clean.admin_email, plan_id: clean.plan_id, assigned_bot_id: clean.assigned_bot_id }), now())
        };
      } catch (error) {
        await store.updateDelivery({ invitation_id: created.id, delivery_status: "failed", delivery_error: "provider_rejected" }).catch(function () {});
        throw new CustomerAccessError("email_delivery_failed", 502, {
          tenant_id: created.tenant_id,
          invitation_id: created.id,
          delivery_status: "failed"
        });
      }
    },

    inspectInvitation: inspectInvitation,

    async consumeInvitation(input) {
      const inspected = await inspectInvitation(input.tenant_id, input.token);
      const password = validatePassword(input.password, input.password_confirmation);
      const salt = crypto.randomBytes(16);
      let user;
      try {
        user = await store.consumeInvitation({
          tenant_id: inspected.tenant_id,
          token_hash: hashInvitationToken(input.token),
          password_hash: hashPassword(password, salt),
          password_salt: salt.toString("base64url")
        });
      } catch (error) {
        throw mapStoreError(error);
      }
      return {
        user_id: user.user_id,
        email: user.email_normalized,
        username: user.email_normalized,
        name: user.email_normalized,
        role: user.role || "admin",
        tenant_id: user.tenant_id,
        company_name: user.company_name || inspected.company_name
      };
    },

    async authenticate(email, password) {
      const normalized = normalizeEmail(email);
      if (!validEmail(normalized) || !password) return null;
      let user;
      try { user = await store.activeUserByEmail(normalized); }
      catch (error) { throw mapStoreError(error); }
      if (!user || !user.password_hash || !user.password_salt || !user.tenant_id || !user.active) return null;
      let candidate;
      try { candidate = hashPassword(password, Buffer.from(user.password_salt, "base64url")); }
      catch (_) { return null; }
      const stored = Buffer.from(String(user.password_hash));
      const supplied = Buffer.from(String(candidate));
      if (stored.length !== supplied.length || !crypto.timingSafeEqual(stored, supplied)) return null;
      return { user_id: user.user_id, email: normalized, username: normalized, name: normalized, role: user.role || "admin", tenant_id: user.tenant_id, company_name: user.company_name || null };
    },

    async validateSession(session) {
      const email = normalizeEmail(session && session.email);
      const userId = String(session && session.user_id || "");
      const tenantId = String(session && session.tenant_id || "").trim().toLowerCase();
      if (!validEmail(email) || !userId || !tenantId) return null;
      let user;
      try { user = await store.activeUserByEmail(email); }
      catch (error) { throw mapStoreError(error); }
      if (!user || !user.active || String(user.user_id) !== userId || String(user.tenant_id) !== tenantId) return null;
      if ((user.role || "admin") !== (session.role || "admin")) return null;
      return {
        user_id: String(user.user_id),
        email,
        username: email,
        name: email,
        role: user.role || "admin",
        tenant_id: tenantId,
        company_name: user.company_name || null
      };
    },

    async listInvitations() {
      let rows;
      try { rows = await store.listInvitations(); }
      catch (error) { throw mapStoreError(error); }
      return rows.map(function (row) { return publicInvitation(row, now()); });
    },

    async revokeInvitation(invitationId, actor) {
      if (!/^[0-9a-f-]{36}$/i.test(String(invitationId || ""))) throw new CustomerAccessError("invalid_invitation", 403);
      let row;
      try { row = await store.revokeInvitation(invitationId, String(actor && (actor.user_id || actor.email || actor.username) || "super_admin").slice(0, 160)); }
      catch (error) { throw mapStoreError(error); }
      return publicInvitation(row, now());
    }
  };
}

module.exports = {
  CustomerAccessError,
  InMemoryCustomerAccessStore,
  SupabaseCustomerAccessStore,
  createCustomerAccessService,
  createMemoryEmailSender,
  createResendEmailSender,
  hashInvitationToken,
  invitationStatus,
  normalizeEmail,
  validateCreateInput,
  validatePassword
};
