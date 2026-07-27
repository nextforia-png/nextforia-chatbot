"use strict";

const crypto = require("crypto");

const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"];
const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "suspended", "cancelled", "pilot"];
const BYPASS_STATUSES = ["trial", "pilot"];
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const WOMPI_SANDBOX_API_BASE = "https://sandbox.wompi.co/v1";

class PaymentError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status || 400;
  }
}

function text(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max || 500);
}

function identifier(value) {
  const clean = text(value, 64).toLowerCase();
  return ID_PATTERN.test(clean) ? clean : "";
}

function nonNegativeMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new PaymentError("invalid_amount", 400);
  return Math.round(parsed);
}

function safeRate(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 0;
  return parsed;
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function addMonth(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

function timingSafeHex(left, right) {
  const a = Buffer.from(String(left || "").toLowerCase(), "utf8");
  const b = Buffer.from(String(right || "").toLowerCase(), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function pathValue(source, path) {
  return String(path || "").split(".").reduce(function (value, key) {
    return value != null && typeof value === "object" ? value[key] : undefined;
  }, source);
}

function eventChecksum(event, secret) {
  const signature = event && event.signature || {};
  const properties = Array.isArray(signature.properties) ? signature.properties : [];
  if (!properties.length || event.timestamp == null || !secret) return "";
  const values = properties.map(function (property) {
    const value = pathValue(event.data, property);
    if (value == null || typeof value === "object") throw new PaymentError("invalid_webhook", 400);
    return String(value);
  });
  return crypto.createHash("sha256")
    .update(values.join("") + String(event.timestamp) + String(secret))
    .digest("hex");
}

function validateWompiEvent(event, eventSecret, headerChecksum) {
  if (!event || event.event !== "transaction.updated" || !event.data || !event.data.transaction) {
    throw new PaymentError("unsupported_webhook", 400);
  }
  if (event.environment !== "test") throw new PaymentError("production_webhook_blocked", 400);
  const supplied = text(headerChecksum || event.signature && event.signature.checksum, 128);
  const expected = eventChecksum(event, eventSecret);
  if (!supplied || !expected || !timingSafeHex(supplied, expected)) {
    throw new PaymentError("invalid_webhook_signature", 401);
  }
  return true;
}

function integritySignature(reference, amountInCents, integritySecret) {
  return crypto.createHash("sha256")
    .update(String(reference) + String(amountInCents) + "COP" + String(integritySecret || ""))
    .digest("hex");
}

function wompiStatus(value) {
  const status = text(value, 32).toUpperCase();
  if (status === "APPROVED") return { payment_status: "paid", subscription_status: "active", ready: true };
  if (status === "VOIDED") return { payment_status: "refunded", subscription_status: "cancelled", ready: false };
  if (status === "DECLINED" || status === "ERROR") {
    return { payment_status: "failed", subscription_status: null, ready: false };
  }
  return { payment_status: "pending", subscription_status: null, ready: false };
}

function firstRealFeeInCents(transaction) {
  const candidates = [
    transaction && transaction.fee_in_cents,
    transaction && transaction.provider_fee_in_cents,
    transaction && transaction.commission_in_cents,
    transaction && transaction.fees && transaction.fees.wompi && transaction.fees.wompi.amount_in_cents
  ];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
  }
  return null;
}

function feeBreakdown(transaction, estimatedRate, estimatedFixedFee, estimatedTaxRate) {
  const amountInCents = nonNegativeMoney(transaction && transaction.amount_in_cents);
  const amount = Math.round(amountInCents / 100);
  const realFeeInCents = firstRealFeeInCents(transaction);
  const estimatedBaseFee = Math.round(
    amount * safeRate(estimatedRate) + nonNegativeMoney(estimatedFixedFee || 0)
  );
  const estimatedFee = Math.round(estimatedBaseFee * (1 + safeRate(estimatedTaxRate)));
  const fee = realFeeInCents == null
    ? estimatedFee
    : Math.round(realFeeInCents / 100);
  return {
    amount_charged: amount,
    provider_fee: Math.min(amount, Math.max(0, fee)),
    provider_fee_type: realFeeInCents == null ? "estimated" : "real",
    net_amount: Math.max(0, amount - fee)
  };
}

function publicContract(contract, history, audit) {
  if (!contract) return null;
  const clean = Object.assign({}, contract);
  delete clean.customer_email;
  return Object.assign(clean, {
    history: (history || []).map(function (row) {
      const item = Object.assign({}, row);
      delete item.customer_email;
      return item;
    }),
    audit: (audit || []).map(function (row) { return Object.assign({}, row); })
  });
}

function wompiApiError(error) {
  const status = error && error.response && error.response.status;
  const data = error && error.response && error.response.data;
  const reason = data && data.error && (data.error.reason || data.error.type);
  const code = status === 401 || status === 403 ? "wompi_private_key_rejected" :
    status === 422 ? "wompi_payment_source_rejected" : "wompi_api_error";
  const problem = new PaymentError(code, status === 422 ? 422 : 503);
  problem.detail = reason || code;
  return problem;
}

function createWompiApiClient(options) {
  options = options || {};
  const axiosClient = options.axiosClient;
  const apiBaseUrl = String(options.apiBaseUrl || WOMPI_SANDBOX_API_BASE).replace(/\/$/, "");
  const publicKey = text(options.publicKey, 200);
  const privateKey = text(options.privateKey, 300);
  function privateHeaders() {
    if (!/^prv_test_/.test(privateKey)) throw new PaymentError("wompi_private_key_required", 503);
    return { Authorization: "Bearer " + privateKey };
  }
  return {
    async acceptanceTokens() {
      try {
        const response = await axiosClient.get(apiBaseUrl + "/merchants/" + encodeURIComponent(publicKey), { timeout: 8000 });
        const data = response.data && response.data.data || {};
        return {
          acceptance_token: data.presigned_acceptance && data.presigned_acceptance.acceptance_token || "",
          acceptance_permalink: data.presigned_acceptance && data.presigned_acceptance.permalink || "",
          personal_auth_token: data.presigned_personal_data_auth && data.presigned_personal_data_auth.acceptance_token || "",
          personal_auth_permalink: data.presigned_personal_data_auth && data.presigned_personal_data_auth.permalink || ""
        };
      } catch (error) {
        throw wompiApiError(error);
      }
    },
    async createPaymentSource(input) {
      try {
        const response = await axiosClient.post(apiBaseUrl + "/payment_sources", {
          type: input.type || "CARD",
          token: input.token,
          customer_email: input.customer_email,
          acceptance_token: input.acceptance_token,
          accept_personal_auth: input.accept_personal_auth
        }, { headers: privateHeaders(), timeout: 10000 });
        return response.data && response.data.data || {};
      } catch (error) {
        throw wompiApiError(error);
      }
    },
    async createTransaction(input) {
      const payload = {
        amount_in_cents: input.amount_in_cents,
        currency: "COP",
        signature: input.signature,
        customer_email: input.customer_email,
        reference: input.reference,
        payment_source_id: input.payment_source_id,
        acceptance_token: input.acceptance_token,
        accept_personal_auth: input.accept_personal_auth
      };
      if (input.payment_method) payload.payment_method = input.payment_method;
      if (input.recurrent != null) payload.recurrent = !!input.recurrent;
      try {
        const response = await axiosClient.post(apiBaseUrl + "/transactions", payload, {
          headers: privateHeaders(),
          timeout: 10000
        });
        return response.data && response.data.data || {};
      } catch (error) {
        throw wompiApiError(error);
      }
    }
  };
}

class InMemoryPaymentStore {
  constructor(options) {
    options = options || {};
    this.contracts = new Map();
    this.transactions = [];
    this.events = new Set();
    this.audit = [];
    this.now = typeof options.now === "function" ? options.now : function () { return new Date(); };
  }

  async prepareContract(input) {
    const existing = this.contracts.get(input.tenant_id);
    if (existing && existing.plan_id === input.plan_id && existing.bot_id === input.bot_id) {
      return Object.assign({}, existing);
    }
    if (existing && ["paid", "trial", "pilot"].includes(existing.payment_status) ||
        existing && ["active", "trial", "pilot"].includes(existing.subscription_status)) {
      throw new PaymentError("contract_change_requires_admin", 409);
    }
    const now = this.now().toISOString();
    const contract = Object.assign({}, existing || {}, {
      tenant_id: input.tenant_id,
      customer: input.customer,
      customer_email: input.customer_email || null,
      plan_id: input.plan_id,
      plan_name: input.plan_name,
      bot_id: input.bot_id,
      bot_name: input.bot_name,
      contracted_setup_price: input.contracted_setup_price,
      contracted_monthly_price: input.contracted_monthly_price,
      payment_provider: "wompi",
      payment_status: "pending",
      subscription_status: null,
      provider_transaction_id: null,
      payment_source_id: existing && existing.payment_source_id || null,
      payment_source_type: existing && existing.payment_source_type || null,
      payment_source_status: existing && existing.payment_source_status || null,
      payment_source_public_data: existing && existing.payment_source_public_data || null,
      automatic_billing_enabled: !!(existing && existing.automatic_billing_enabled),
      last_recurring_charge_at: existing && existing.last_recurring_charge_at || null,
      provider_fee: 0,
      provider_fee_type: "estimated",
      net_amount: 0,
      trial_start: null,
      trial_end: null,
      next_payment_date: null,
      ready_for_bot_creation: false,
      bypass_reason: null,
      bypass_approved_by: null,
      bypass_approved_at: null,
      created_at: existing && existing.created_at || now,
      updated_at: now
    });
    this.contracts.set(input.tenant_id, contract);
    return Object.assign({}, contract);
  }

  async startPayment(input) {
    const contract = this.contracts.get(input.tenant_id);
    if (!contract) throw new PaymentError("billing_not_found", 404);
    const now = this.now().toISOString();
    Object.assign(contract, {
      payment_provider: "wompi",
      payment_status: "pending",
      subscription_status: contract.subscription_status === "active" ? "active" : null,
      provider_transaction_id: null,
      ready_for_bot_creation: contract.subscription_status === "active",
      updated_at: now
    });
    const row = {
      id: crypto.randomUUID(),
      tenant_id: input.tenant_id,
      payment_provider: "wompi",
      provider_transaction_id: null,
      provider_reference: input.provider_reference,
      kind: input.kind || "initial",
      payment_status: "pending",
      amount_charged: input.amount_charged,
      provider_fee: 0,
      provider_fee_type: "estimated",
      net_amount: input.amount_charged,
      payment_date: null,
      created_at: now,
      updated_at: now
    };
    this.transactions.push(row);
    this.audit.push({
      id: crypto.randomUUID(), tenant_id: input.tenant_id, action: "payment_started",
      actor: input.actor || "customer", metadata: { reference: input.provider_reference }, created_at: now
    });
    return Object.assign({}, row);
  }

  async savePaymentSource(input) {
    const contract = this.contracts.get(input.tenant_id);
    if (!contract) throw new PaymentError("billing_not_found", 404);
    const now = this.now().toISOString();
    Object.assign(contract, {
      payment_source_id: input.payment_source_id,
      payment_source_type: input.payment_source_type || "CARD",
      payment_source_status: input.payment_source_status || "AVAILABLE",
      payment_source_public_data: input.payment_source_public_data || null,
      automatic_billing_enabled: input.payment_source_status === "AVAILABLE",
      updated_at: now
    });
    this.audit.push({
      id: crypto.randomUUID(), tenant_id: input.tenant_id, action: "payment_source_created",
      actor: input.actor || "customer",
      metadata: { type: contract.payment_source_type, status: contract.payment_source_status },
      created_at: now
    });
    return Object.assign({}, contract);
  }

  async approveBypass(input) {
    const contract = this.contracts.get(input.tenant_id);
    if (!contract) throw new PaymentError("billing_not_found", 404);
    const now = this.now().toISOString();
    const isTrial = input.subscription_status === "trial";
    Object.assign(contract, {
      payment_status: "paid",
      subscription_status: input.subscription_status,
      trial_start: isTrial ? input.trial_start || now : null,
      trial_end: isTrial ? input.trial_end : null,
      next_payment_date: isTrial ? input.trial_end : null,
      ready_for_bot_creation: true,
      bypass_reason: input.reason,
      bypass_approved_by: input.actor,
      bypass_approved_at: now,
      updated_at: now
    });
    this.audit.push({
      id: crypto.randomUUID(), tenant_id: input.tenant_id, action: "payment_bypass_approved",
      actor: input.actor, metadata: { subscription_status: input.subscription_status, reason: input.reason }, created_at: now
    });
    return Object.assign({}, contract);
  }

  async processWompiEvent(input) {
    const transaction = this.transactions.find(function (row) {
      return row.provider_reference === input.provider_reference;
    });
    if (!transaction) throw new PaymentError("payment_reference_not_found", 404);
    if (transaction.tenant_id !== input.tenant_id) throw new PaymentError("payment_tenant_mismatch", 409);
    if (transaction.amount_charged !== input.amount_charged) {
      throw new PaymentError("payment_amount_mismatch", 409);
    }
    const eventKey = [input.provider_transaction_id, input.payment_status].join(":");
    if (this.events.has(eventKey)) {
      return { duplicate: true, contract: Object.assign({}, this.contracts.get(input.tenant_id) || {}) };
    }
    this.events.add(eventKey);
    if (transaction.payment_status === "paid" && ["pending", "failed"].includes(input.payment_status)) {
      return { duplicate: false, ignored: true, contract: Object.assign({}, this.contracts.get(input.tenant_id) || {}) };
    }
    const now = this.now().toISOString();
    Object.assign(transaction, {
      provider_transaction_id: input.provider_transaction_id,
      payment_status: input.payment_status,
      amount_charged: input.amount_charged,
      provider_fee: input.provider_fee,
      provider_fee_type: input.provider_fee_type,
      net_amount: input.net_amount,
      payment_date: input.payment_date,
      updated_at: now
    });
    const contract = this.contracts.get(input.tenant_id);
    if (!contract) throw new PaymentError("billing_not_found", 404);
    const resolvedSubscriptionStatus = transaction.kind === "monthly" && input.payment_status === "failed"
      ? "past_due"
      : input.subscription_status || contract.subscription_status;
    const resolvedReady = transaction.kind === "monthly" && input.payment_status === "failed"
      ? contract.ready_for_bot_creation
      : input.ready_for_bot_creation;
    Object.assign(contract, {
      payment_status: input.payment_status,
      subscription_status: resolvedSubscriptionStatus,
      provider_transaction_id: input.provider_transaction_id,
      provider_fee: input.provider_fee,
      provider_fee_type: input.provider_fee_type,
      net_amount: input.net_amount,
      next_payment_date: input.next_payment_date || contract.next_payment_date,
      last_recurring_charge_at: transaction.kind === "monthly" && input.payment_status === "paid"
        ? input.payment_date
        : contract.last_recurring_charge_at,
      ready_for_bot_creation: resolvedReady,
      updated_at: now
    });
    this.audit.push({
      id: crypto.randomUUID(), tenant_id: input.tenant_id, action: "wompi_webhook_processed",
      actor: "wompi", metadata: { transaction_id: input.provider_transaction_id, status: input.payment_status }, created_at: now
    });
    return { duplicate: false, contract: Object.assign({}, contract) };
  }

  async tenantBilling(tenantId) {
    const contract = this.contracts.get(tenantId);
    return publicContract(
      contract,
      this.transactions.filter(function (row) { return row.tenant_id === tenantId; })
        .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }),
      this.audit.filter(function (row) { return row.tenant_id === tenantId; })
        .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); })
    );
  }

  async adminBilling() {
    const result = [];
    for (const tenantId of this.contracts.keys()) result.push(await this.tenantBilling(tenantId));
    return result.sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
  }

  async dueSubscriptions(input) {
    const asOf = iso(input && input.as_of || this.now());
    const limit = Math.max(1, Math.min(100, Number(input && input.limit || 25)));
    const transactions = this.transactions;
    return Array.from(this.contracts.values())
      .filter(function (contract) {
        return contract.automatic_billing_enabled &&
          contract.payment_source_id &&
          ["active", "past_due"].includes(contract.subscription_status) &&
          contract.next_payment_date &&
          new Date(contract.next_payment_date) <= new Date(asOf) &&
          !transactions.some(function (tx) {
            return tx.tenant_id === contract.tenant_id &&
              tx.kind === "monthly" &&
              tx.payment_status === "pending";
          });
      })
      .sort(function (a, b) { return String(a.next_payment_date).localeCompare(String(b.next_payment_date)); })
      .slice(0, limit)
      .map(function (row) { return Object.assign({}, row); });
  }
}

class SupabasePaymentStore {
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
      const message = String(error && error.response && JSON.stringify(error.response.data) || error && error.message || "");
      if (/BILLING_NOT_FOUND/.test(message)) throw new PaymentError("billing_not_found", 404);
      if (/PAYMENT_REFERENCE_NOT_FOUND/.test(message)) throw new PaymentError("payment_reference_not_found", 404);
      if (/PAYMENT_TENANT_MISMATCH/.test(message)) throw new PaymentError("payment_tenant_mismatch", 409);
      if (/PAYMENT_AMOUNT_MISMATCH/.test(message)) throw new PaymentError("payment_amount_mismatch", 409);
      if (/CONTRACT_CHANGE_REQUIRES_ADMIN/.test(message)) throw new PaymentError("contract_change_requires_admin", 409);
      throw new PaymentError("billing_unavailable", 503);
    }
  }

  async prepareContract(input) {
    const rows = await this.rpc("platform_billing_prepare_v1", {
      p_tenant_id: input.tenant_id,
      p_plan_id: input.plan_id,
      p_bot_id: input.bot_id,
      p_customer_email: input.customer_email || null
    });
    return rows[0] || null;
  }

  async startPayment(input) {
    const rows = await this.rpc("platform_billing_start_payment_v1", {
      p_tenant_id: input.tenant_id,
      p_reference: input.provider_reference,
      p_amount: input.amount_charged,
      p_kind: input.kind || "initial",
      p_actor: input.actor || "customer"
    });
    return rows[0] || null;
  }

  async savePaymentSource(input) {
    const rows = await this.rpc("platform_billing_save_payment_source_v1", {
      p_tenant_id: input.tenant_id,
      p_payment_source_id: input.payment_source_id,
      p_payment_source_type: input.payment_source_type || "CARD",
      p_payment_source_status: input.payment_source_status || "AVAILABLE",
      p_payment_source_public_data: input.payment_source_public_data || {},
      p_actor: input.actor || "customer"
    });
    return rows[0] || null;
  }

  async approveBypass(input) {
    const rows = await this.rpc("platform_billing_approve_bypass_v1", {
      p_tenant_id: input.tenant_id,
      p_subscription_status: input.subscription_status,
      p_trial_start: input.trial_start || null,
      p_trial_end: input.trial_end || null,
      p_reason: input.reason,
      p_actor: input.actor
    });
    return rows[0] || null;
  }

  async processWompiEvent(input) {
    const rows = await this.rpc("platform_billing_process_wompi_v1", {
      p_tenant_id: input.tenant_id,
      p_reference: input.provider_reference,
      p_provider_transaction_id: input.provider_transaction_id,
      p_payment_status: input.payment_status,
      p_subscription_status: input.subscription_status,
      p_amount_charged: input.amount_charged,
      p_provider_fee: input.provider_fee,
      p_provider_fee_type: input.provider_fee_type,
      p_net_amount: input.net_amount,
      p_payment_date: input.payment_date,
      p_next_payment_date: input.next_payment_date,
      p_ready_for_bot_creation: input.ready_for_bot_creation
    });
    return rows[0] || null;
  }

  async tenantBilling(tenantId) {
    const rows = await this.rpc("platform_billing_tenant_v1", { p_tenant_id: tenantId });
    return rows[0] || null;
  }

  async adminBilling() {
    const rows = await this.rpc("platform_billing_admin_v1", {});
    return Array.isArray(rows[0]) ? rows[0] : rows;
  }

  async dueSubscriptions(input) {
    const rows = await this.rpc("platform_billing_due_subscriptions_v1", {
      p_as_of: input && input.as_of || null,
      p_limit: input && input.limit || 25
    });
    return Array.isArray(rows[0]) ? rows[0] : rows;
  }
}

function createPaymentService(options) {
  options = options || {};
  const store = options.store;
  const catalogService = options.catalogService;
  const publicKey = text(options.publicKey, 200);
  const privateKey = text(options.privateKey, 300);
  const integritySecret = text(options.integritySecret, 300);
  const eventSecret = text(options.eventSecret, 300);
  const estimatedFeeRate = safeRate(options.estimatedFeeRate);
  const estimatedFixedFee = nonNegativeMoney(options.estimatedFixedFee || 0);
  const estimatedTaxRate = safeRate(options.estimatedTaxRate);
  const publicBaseUrl = String(options.publicBaseUrl || "").replace(/\/$/, "");
  const now = typeof options.now === "function" ? options.now : function () { return new Date(); };
  const wompiClient = options.wompiClient || (options.axiosClient ? createWompiApiClient({
    axiosClient: options.axiosClient,
    apiBaseUrl: options.wompiApiBaseUrl,
    publicKey,
    privateKey
  }) : null);

  async function selectedCatalog(planId, botId) {
    const cleanPlan = identifier(planId);
    const cleanBot = identifier(botId);
    if (!cleanPlan) throw new PaymentError("invalid_plan_id", 400);
    if (!cleanBot) throw new PaymentError("invalid_bot_id", 400);
    const catalogs = await catalogService.activeCatalogs();
    const plan = (catalogs.plans || []).find(function (row) { return row.id === cleanPlan; });
    const bot = (catalogs.bots || []).find(function (row) { return row.id === cleanBot; });
    if (!plan) throw new PaymentError("plan_not_found", 404);
    if (!bot) throw new PaymentError("bot_not_found", 404);
    if (plan.bot_id && plan.bot_id !== cleanBot) throw new PaymentError("invalid_plan_for_bot", 400);
    return { plan, bot };
  }

  async function prepare(input) {
    const tenantId = identifier(input && input.tenant_id);
    if (!tenantId) throw new PaymentError("invalid_tenant_id", 400);
    const selected = await selectedCatalog(input.plan_id, input.bot_id);
    return store.prepareContract({
      tenant_id: tenantId,
      customer: text(input.customer, 120) || tenantId,
      customer_email: text(input.customer_email, 254).toLowerCase() || null,
      plan_id: selected.plan.id,
      plan_name: selected.plan.nombre || selected.plan.name || selected.plan.id,
      bot_id: selected.bot.id,
      bot_name: selected.bot.nombre || selected.bot.name || selected.bot.id,
      contracted_setup_price: nonNegativeMoney(selected.plan.precio_setup),
      contracted_monthly_price: nonNegativeMoney(selected.plan.precio_mensual)
    });
  }

  function ensureAutomaticBillingConfigured() {
    if (!/^pub_test_/.test(publicKey) || !/^test_integrity_/.test(integritySecret) ||
        !/^prv_test_/.test(privateKey) || !publicBaseUrl || !wompiClient) {
      throw new PaymentError("wompi_staging_not_configured", 503);
    }
  }

  function referenceFor(contract, kind) {
    return "nexfor-" + contract.tenant_id.length + "-" + contract.tenant_id + "-" +
      (kind || "initial") + "-" + now().getTime().toString(36) + "-" + crypto.randomBytes(4).toString("hex");
  }

  async function startCharge(contract, input) {
    const kind = input.kind || "initial";
    const amount = nonNegativeMoney(input.amount_charged);
    if (amount <= 0) throw new PaymentError("invalid_amount", 400);
    const reference = referenceFor(contract, kind);
    const amountInCents = amount * 100;
    const signature = integritySignature(reference, amountInCents, integritySecret);
    await store.startPayment({
      tenant_id: contract.tenant_id,
      provider_reference: reference,
      kind,
      amount_charged: amount,
      actor: text(input.actor, 160) || "customer"
    });
    if (input.submit !== false) {
      await wompiClient.createTransaction({
        amount_in_cents: amountInCents,
        signature,
        customer_email: input.customer_email,
        reference,
        payment_source_id: input.payment_source_id || contract.payment_source_id,
        acceptance_token: input.acceptance_token,
        accept_personal_auth: input.accept_personal_auth,
        recurrent: kind === "monthly"
      });
    }
    return {
      payment_provider: "wompi",
      environment: "test",
      reference,
      kind,
      amount_charged: amount
    };
  }

  return {
    async prepareContract(input) {
      return prepare(input || {});
    },

    async startCheckout(input) {
      if (!/^pub_test_/.test(publicKey) || !/^test_integrity_/.test(integritySecret) || !publicBaseUrl) {
        throw new PaymentError("wompi_staging_not_configured", 503);
      }
      const contract = await prepare(input || {});
      if (contract.ready_for_bot_creation ||
          ["active", "trial", "pilot"].includes(contract.subscription_status)) {
        throw new PaymentError("subscription_already_ready", 409);
      }
      const amount = nonNegativeMoney(contract.contracted_setup_price) +
        nonNegativeMoney(contract.contracted_monthly_price);
      if (amount <= 0) throw new PaymentError("invalid_amount", 400);
      const reference = "nexfor-" + contract.tenant_id.length + "-" + contract.tenant_id + "-" +
        now().getTime().toString(36) + "-" + crypto.randomBytes(4).toString("hex");
      const amountInCents = amount * 100;
      const signature = integritySignature(reference, amountInCents, integritySecret);
      await store.startPayment({
        tenant_id: contract.tenant_id,
        provider_reference: reference,
        amount_charged: amount,
        actor: text(input.actor, 160) || "customer"
      });
      const query = new URLSearchParams({
        "public-key": publicKey,
        currency: "COP",
        "amount-in-cents": String(amountInCents),
        reference: reference,
        "signature:integrity": signature,
        "redirect-url": publicBaseUrl + "/admin/panel?tab=plan&payment_return=1"
      });
      return {
        payment_provider: "wompi",
        environment: "test",
        reference,
        amount_charged: amount,
        checkout_url: "https://checkout.wompi.co/p/?" + query.toString()
      };
    },

    async paymentSourceAuthorization(input) {
      ensureAutomaticBillingConfigured();
      const contract = await prepare(input || {});
      if (contract.ready_for_bot_creation ||
          ["active", "trial", "pilot"].includes(contract.subscription_status)) {
        throw new PaymentError("subscription_already_ready", 409);
      }
      const tokens = await wompiClient.acceptanceTokens();
      if (!tokens.acceptance_token || !tokens.personal_auth_token) {
        throw new PaymentError("wompi_acceptance_tokens_unavailable", 503);
      }
      return {
        payment_provider: "wompi",
        environment: "test",
        public_key: publicKey,
        contract,
        acceptance: tokens
      };
    },

    async confirmPaymentSource(input) {
      ensureAutomaticBillingConfigured();
      const contract = await prepare(input || {});
      if (contract.ready_for_bot_creation ||
          ["active", "trial", "pilot"].includes(contract.subscription_status)) {
        throw new PaymentError("subscription_already_ready", 409);
      }
      const token = text(input.token || input.source_token || input.card_token || input.id, 180);
      if (!token) throw new PaymentError("payment_source_token_required", 400);
      const customerEmail = text(input.customer_email, 254).toLowerCase();
      if (!customerEmail) throw new PaymentError("customer_email_required", 400);
      const tokens = await wompiClient.acceptanceTokens();
      const paymentSource = await wompiClient.createPaymentSource({
        type: text(input.payment_source_type, 20).toUpperCase() || "CARD",
        token,
        customer_email: customerEmail,
        acceptance_token: tokens.acceptance_token,
        accept_personal_auth: tokens.personal_auth_token
      });
      const sourceId = text(paymentSource.id, 180);
      if (!sourceId) throw new PaymentError("payment_source_not_created", 503);
      const sourceStatus = text(paymentSource.status, 40).toUpperCase() || "AVAILABLE";
      const sourceType = text(paymentSource.type, 40).toUpperCase() || "CARD";
      const publicData = paymentSource.public_data || paymentSource.extra || {};
      const saved = await store.savePaymentSource({
        tenant_id: contract.tenant_id,
        payment_source_id: sourceId,
        payment_source_type: sourceType,
        payment_source_status: sourceStatus,
        payment_source_public_data: publicData,
        actor: text(input.actor, 160) || "customer"
      });
      if (sourceStatus !== "AVAILABLE") {
        throw new PaymentError("payment_source_not_available", 422);
      }
      const amount = nonNegativeMoney(saved.contracted_setup_price) +
        nonNegativeMoney(saved.contracted_monthly_price);
      const charge = await startCharge(saved, {
        kind: "initial",
        amount_charged: amount,
        customer_email: customerEmail,
        payment_source_id: sourceId,
        acceptance_token: tokens.acceptance_token,
        accept_personal_auth: tokens.personal_auth_token,
        actor: text(input.actor, 160) || "customer",
        submit: input.submit !== false
      });
      return { contract: saved, charge };
    },

    async approveBypass(input) {
      const tenantId = identifier(input && input.tenant_id);
      const status = text(input && input.subscription_status, 20).toLowerCase();
      const reason = text(input && input.reason, 500);
      const actor = text(input && input.actor, 160);
      if (!tenantId) throw new PaymentError("invalid_tenant_id", 400);
      if (!BYPASS_STATUSES.includes(status)) throw new PaymentError("invalid_bypass_status", 400);
      if (reason.length < 4 || !actor) throw new PaymentError("bypass_audit_required", 400);
      let trialStart = null;
      let trialEnd = null;
      if (status === "trial") {
        trialStart = iso(input.trial_start || now());
        trialEnd = iso(input.trial_end);
        if (!trialStart || !trialEnd || new Date(trialEnd) <= new Date(trialStart)) {
          throw new PaymentError("invalid_trial_dates", 400);
        }
      }
      return store.approveBypass({
        tenant_id: tenantId,
        subscription_status: status,
        trial_start: trialStart,
        trial_end: trialEnd,
        reason,
        actor
      });
    },

    async processWebhook(event, headerChecksum) {
      if (!/^test_events_/.test(eventSecret)) throw new PaymentError("wompi_staging_not_configured", 503);
      validateWompiEvent(event, eventSecret, headerChecksum);
      const transaction = event.data.transaction;
      const reference = text(transaction.reference, 180);
      const providerTransactionId = text(transaction.id, 180);
      if (!reference || !providerTransactionId) throw new PaymentError("invalid_webhook", 400);
      const match = /^nexfor-(\d{1,2})-/.exec(reference);
      if (!match) throw new PaymentError("invalid_payment_reference", 400);
      const length = Number(match[1]);
      const start = match[0].length;
      const tenantId = identifier(reference.slice(start, start + length));
      if (!tenantId || reference.charAt(start + length) !== "-") {
        throw new PaymentError("invalid_payment_reference", 400);
      }
      const mapped = wompiStatus(transaction.status);
      const fees = feeBreakdown(transaction, estimatedFeeRate, estimatedFixedFee, estimatedTaxRate);
      const paymentDate = mapped.payment_status === "paid"
        ? iso(transaction.finalized_at || transaction.created_at || now())
        : null;
      return store.processWompiEvent(Object.assign({
        tenant_id: tenantId,
        provider_reference: reference,
        provider_transaction_id: providerTransactionId,
        payment_status: mapped.payment_status,
        subscription_status: mapped.subscription_status,
        payment_date: paymentDate,
        next_payment_date: mapped.payment_status === "paid" ? addMonth(paymentDate) : null,
        ready_for_bot_creation: mapped.ready
      }, fees));
    },

    async chargeDueSubscriptions(input) {
      ensureAutomaticBillingConfigured();
      const due = await store.dueSubscriptions({
        as_of: input && input.as_of || now(),
        limit: input && input.limit || 25
      });
      const results = [];
      for (const contract of due) {
        const amount = nonNegativeMoney(contract.contracted_monthly_price);
        if (amount <= 0) continue;
        const tokens = await wompiClient.acceptanceTokens();
        const charge = await startCharge(contract, {
          kind: "monthly",
          amount_charged: amount,
          customer_email: contract.customer_email,
          payment_source_id: contract.payment_source_id,
          acceptance_token: tokens.acceptance_token,
          accept_personal_auth: tokens.personal_auth_token,
          actor: input && input.actor || "system",
          submit: !(input && input.submit === false)
        });
        results.push(Object.assign({ tenant_id: contract.tenant_id }, charge));
      }
      return results;
    },

    async tenantBilling(tenantId) {
      const clean = identifier(tenantId);
      if (!clean) throw new PaymentError("invalid_tenant_id", 400);
      return store.tenantBilling(clean);
    },

    async adminBilling() {
      return store.adminBilling();
    }
  };
}

module.exports = {
  BYPASS_STATUSES,
  InMemoryPaymentStore,
  PAYMENT_STATUSES,
  PaymentError,
  SUBSCRIPTION_STATUSES,
  SupabasePaymentStore,
  addMonth,
  createPaymentService,
  createWompiApiClient,
  eventChecksum,
  feeBreakdown,
  integritySignature,
  validateWompiEvent,
  wompiStatus
};
