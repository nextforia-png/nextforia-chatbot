"use strict";

const crypto = require("crypto");

const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"];
const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "suspended", "cancelled", "pilot"];
const BYPASS_STATUSES = ["trial", "pilot"];
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;

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
      kind: "initial",
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
    Object.assign(contract, {
      payment_status: input.payment_status,
      subscription_status: input.subscription_status || contract.subscription_status,
      provider_transaction_id: input.provider_transaction_id,
      provider_fee: input.provider_fee,
      provider_fee_type: input.provider_fee_type,
      net_amount: input.net_amount,
      next_payment_date: input.next_payment_date,
      ready_for_bot_creation: input.ready_for_bot_creation,
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
}

function createPaymentService(options) {
  options = options || {};
  const store = options.store;
  const catalogService = options.catalogService;
  const publicKey = text(options.publicKey, 200);
  const integritySecret = text(options.integritySecret, 300);
  const eventSecret = text(options.eventSecret, 300);
  const estimatedFeeRate = safeRate(options.estimatedFeeRate);
  const estimatedFixedFee = nonNegativeMoney(options.estimatedFixedFee || 0);
  const estimatedTaxRate = safeRate(options.estimatedTaxRate);
  const publicBaseUrl = String(options.publicBaseUrl || "").replace(/\/$/, "");
  const now = typeof options.now === "function" ? options.now : function () { return new Date(); };

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
      contracted_setup_price: 0,
      contracted_monthly_price: nonNegativeMoney(selected.plan.precio_mensual)
    });
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
  eventChecksum,
  feeBreakdown,
  integritySignature,
  validateWompiEvent,
  wompiStatus
};
