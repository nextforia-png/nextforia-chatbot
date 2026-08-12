"use strict";

const crypto = require("crypto");

const CUSTOMER_ORDER_STATE_TOOL = "customer_order_state_v1";
const ORDER_STAGES = Object.freeze(["por_confirmar", "pagado", "preparacion", "enviado", "cancelado"]);
const ORDER_ACTIONS = Object.freeze(["confirm_payment", "start_preparation", "send_tracking", "mark_sent", "cancel"]);

class CustomerOrderError extends Error {
  constructor(code, message, status) {
    super(message || code);
    this.name = "CustomerOrderError";
    this.code = code;
    this.status = status || 400;
  }
}

function text(value, maximum) {
  return String(value == null ? "" : value).trim().slice(0, maximum || 500);
}

function tenantId(value) {
  return text(value, 120).toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

function cleanId(value) {
  return text(value, 100).replace(/[^a-zA-Z0-9._-]/g, "");
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 100).map(function (item) {
    return {
      name: text(item && (item.name || item.title), 240),
      qty: Math.max(1, Math.min(999, Math.floor(Number(item && item.qty) || 1))),
      price: amount(item && (item.price != null ? item.price : item.price_amount)),
      product_url: text(item && item.product_url, 1000)
    };
  }).filter(function (item) { return item.name; });
}

function normalizeOrder(input) {
  input = input || {};
  const cleanTenant = tenantId(input.tenant_id);
  const id = cleanId(input.id);
  const stage = ORDER_STAGES.includes(input.stage) ? input.stage : "por_confirmar";
  if (!cleanTenant) throw new CustomerOrderError("tenant_required", "El pedido necesita una empresa.");
  if (!id) throw new CustomerOrderError("order_id_required", "El pedido necesita un identificador.");
  const createdAt = text(input.created_at, 60) || new Date().toISOString();
  const updatedAt = text(input.updated_at, 60) || createdAt;
  return {
    version: 1,
    id,
    order_number: text(input.order_number, 40) || id,
    tenant_id: cleanTenant,
    conversation_id: text(input.conversation_id, 500),
    channel: text(input.channel, 40).toLowerCase() || "whatsapp",
    name: text(input.name, 160) || "Cliente",
    phone: text(input.phone, 80),
    email: text(input.email, 200).toLowerCase(),
    id_number: text(input.id_number, 80),
    address: text(input.address, 500),
    city: text(input.city, 200),
    location: text(input.location, 240),
    items: normalizeItems(input.items),
    shipping: amount(input.shipping),
    currency: text(input.currency, 12).toUpperCase() || "COP",
    payment: text(input.payment, 180) || "Por confirmar",
    payment_note: text(input.payment_note || input.paymentNote, 500),
    stage,
    tracking_number: text(input.tracking_number || input.guide, 120),
    tracking_sent_at: text(input.tracking_sent_at, 60),
    created_at: createdAt,
    updated_at: updatedAt,
    revision: Math.max(1, Math.floor(Number(input.revision) || 1)),
    source: text(input.source, 80) || "bot_checkout",
    source_event_id: text(input.source_event_id, 500),
    last_action: text(input.last_action, 80),
    last_actor: text(input.last_actor, 200)
  };
}

class InMemoryCustomerOrderStore {
  constructor() {
    this.events = [];
  }

  async append(record) {
    const normalized = normalizeOrder(record);
    this.events.push(JSON.parse(JSON.stringify(normalized)));
    return normalized;
  }

  async listTenant(targetTenantId, limit) {
    const cleanTenant = tenantId(targetTenantId);
    return this.events.filter(function (record) {
      return record.tenant_id === cleanTenant;
    }).slice().reverse().slice(0, limit || 5000);
  }
}

function collapseLatest(events) {
  const latest = new Map();
  (events || []).forEach(function (raw) {
    let record;
    try { record = normalizeOrder(raw); } catch (_) { return; }
    const current = latest.get(record.id);
    if (!current || record.revision > current.revision ||
      (record.revision === current.revision && record.updated_at > current.updated_at)) {
      latest.set(record.id, record);
    }
  });
  return Array.from(latest.values()).sort(function (a, b) {
    return String(b.created_at).localeCompare(String(a.created_at));
  });
}

function createCustomerOrderService(options) {
  options = options || {};
  const store = options.store || new InMemoryCustomerOrderStore();
  const locks = new Map();

  function serialized(key, task) {
    const previous = locks.get(key) || Promise.resolve();
    const next = previous.catch(function () {}).then(task);
    const guarded = next.finally(function () {
      if (locks.get(key) === guarded) locks.delete(key);
    });
    locks.set(key, guarded);
    return guarded;
  }

  async function list(targetTenantId, limit) {
    const cleanTenant = tenantId(targetTenantId);
    if (!cleanTenant) throw new CustomerOrderError("tenant_required", "No pudimos identificar tu empresa.", 403);
    return collapseLatest(await store.listTenant(cleanTenant, Math.max(100, Number(limit) || 5000))).slice(0, Math.min(500, Number(limit) || 200));
  }

  async function get(targetTenantId, orderId) {
    const id = cleanId(orderId);
    const rows = await list(targetTenantId, 500);
    const record = rows.find(function (item) { return item.id === id; });
    if (!record) throw new CustomerOrderError("order_not_found", "No encontramos ese pedido en tu empresa.", 404);
    return record;
  }

  async function create(input) {
    const record = normalizeOrder(input);
    return serialized(record.tenant_id + ":" + record.id, async function () {
      const existing = (await list(record.tenant_id, 500)).find(function (item) { return item.id === record.id; });
      if (existing) return existing;
      return store.append(record);
    });
  }

  async function action(targetTenantId, orderId, actionName, payload, actor) {
    const cleanTenant = tenantId(targetTenantId);
    const id = cleanId(orderId);
    const action = text(actionName, 80);
    if (!ORDER_ACTIONS.includes(action)) throw new CustomerOrderError("invalid_action", "Esa acción no está disponible.");
    return serialized(cleanTenant + ":" + id, async function () {
      const current = await get(cleanTenant, id);
      let nextStage = current.stage;
      const next = Object.assign({}, current);
      if (action === "confirm_payment") {
        if (current.stage !== "por_confirmar") throw new CustomerOrderError("invalid_transition", "Este pago ya fue procesado.", 409);
        nextStage = "pagado";
      } else if (action === "start_preparation") {
        if (current.stage !== "pagado") throw new CustomerOrderError("invalid_transition", "Confirma el pago antes de preparar el pedido.", 409);
        nextStage = "preparacion";
      } else if (action === "mark_sent") {
        if (current.stage !== "preparacion") throw new CustomerOrderError("invalid_transition", "El pedido debe estar en preparación antes de enviarlo.", 409);
        if (!current.tracking_number) throw new CustomerOrderError("tracking_required", "Agrega y envía la guía antes de marcar el pedido como enviado.", 409);
        nextStage = "enviado";
      } else if (action === "cancel") {
        if (current.stage === "enviado" || current.stage === "cancelado") throw new CustomerOrderError("invalid_transition", "Este pedido ya no se puede cancelar desde el panel.", 409);
        nextStage = "cancelado";
      } else if (action === "send_tracking") {
        if (!["pagado", "preparacion", "enviado"].includes(current.stage)) throw new CustomerOrderError("invalid_transition", "Confirma el pago antes de enviar una guía.", 409);
        const tracking = text(payload && payload.tracking_number, 120);
        if (!tracking) throw new CustomerOrderError("tracking_required", "Escribe el número de guía.");
        if (typeof options.sendTracking !== "function") throw new CustomerOrderError("delivery_unavailable", "El canal no está disponible para enviar la guía.", 503);
        await options.sendTracking(current, tracking);
        next.tracking_number = tracking;
        next.tracking_sent_at = new Date().toISOString();
      }
      next.stage = nextStage;
      next.updated_at = new Date().toISOString();
      next.revision = current.revision + 1;
      next.last_action = action;
      next.last_actor = text(actor, 200);
      return store.append(next);
    });
  }

  function createId(input) {
    const seed = [tenantId(input && input.tenant_id), text(input && input.conversation_id, 500), text(input && input.source_event_id, 500)].join("\u001f");
    return "ord-" + crypto.createHash("sha256").update(seed || crypto.randomUUID()).digest("hex").slice(0, 20);
  }

  return { list, get, create, action, createId };
}

module.exports = {
  CUSTOMER_ORDER_STATE_TOOL,
  ORDER_ACTIONS,
  ORDER_STAGES,
  CustomerOrderError,
  InMemoryCustomerOrderStore,
  collapseLatest,
  createCustomerOrderService,
  normalizeOrder
};
