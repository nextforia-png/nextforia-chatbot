"use strict";

const assert = require("assert");
const {
  InMemoryCustomerOrderStore,
  CustomerOrderError,
  createCustomerOrderService,
  enrichCustomerOrderContact
} = require("./customer-orders");

async function rejectsCode(promise, code) {
  let error = null;
  try { await promise; } catch (caught) { error = caught; }
  assert(error instanceof CustomerOrderError);
  assert.strictEqual(error.code, code);
}

(async function () {
  const deliveries = [];
  const service = createCustomerOrderService({
    store: new InMemoryCustomerOrderStore(),
    sendTracking: async function (order, tracking, trackingUrl) {
      deliveries.push({ tenant_id: order.tenant_id, conversation_id: order.conversation_id, tracking, tracking_url: trackingUrl });
    }
  });
  const base = {
    id: "ord-a",
    order_number: "NX-0001",
    tenant_id: "tenant-a",
    conversation_id: "ig:customer-a",
    name: "Valentina Ríos",
    items: [{ name: "Producto", qty: 2, price: 45000 }],
    shipping: 12900,
    shipping_status: "priced",
    stage: "por_confirmar"
  };
  const created = await service.create(base);
  assert.strictEqual(created.tenant_id, "tenant-a");
  assert.strictEqual(created.subtotal, 90000);
  assert.strictEqual(created.shipping, 12900);
  assert.strictEqual(created.total, 102900);
  assert.strictEqual((await service.list("tenant-a")).length, 1);
  assert.strictEqual((await service.list("tenant-b")).length, 0);
  await rejectsCode(service.get("tenant-b", "ord-a"), "order_not_found");

  const enriched = enrichCustomerOrderContact(created, {
    name: "Nombre actualizado",
    phone: "+573001112233",
    email: "cliente@example.com",
    address: "Dirección del perfil",
    address_line_2: "Apto 501",
    neighborhood: "Chapinero",
    city: "Bogotá",
    state: "Cundinamarca",
    postal_code: "110231",
    country: "Colombia",
    id_number: "1037632938",
    delivery_instructions: "Llamar al llegar"
  });
  assert.strictEqual(enriched.name, "Valentina Ríos", "the order snapshot keeps explicit values");
  assert.strictEqual(enriched.phone, "+573001112233", "missing order values come from the canonical customer profile");
  assert.strictEqual(enriched.address_line_2, "Apto 501");
  assert.strictEqual(enriched.neighborhood, "Chapinero");
  assert.strictEqual(enriched.city, "Bogotá");
  assert.strictEqual(enriched.delivery_instructions, "Llamar al llegar");
  assert.strictEqual(enriched.customer_profile.email, "cliente@example.com");

  const paid = await service.action("tenant-a", "ord-a", "confirm_payment", {
    tracking_number: "",
    tracking_url: ""
  }, "agent@example.com");
  assert.strictEqual(paid.stage, "pagado");
  await rejectsCode(service.action("tenant-a", "ord-a", "confirm_payment", {}, "agent@example.com"), "invalid_transition");

  const notifications = [];
  const notificationService = createCustomerOrderService({
    store: new InMemoryCustomerOrderStore(),
    notifyTenantOrder: async function (order) {
      notifications.push(order);
      return { id: "tenant-order:" + order.id, status: "sent", delivery_mode: "template", delivered_at: "2026-08-25T12:00:00.000Z" };
    }
  });
  await notificationService.create(Object.assign({}, base, { id: "ord-notify" }));
  const notified = await notificationService.action("tenant-a", "ord-notify", "confirm_payment", {}, "agent@example.com");
  assert.strictEqual(notified.stage, "pagado");
  assert.strictEqual(notifications.length, 1, "only an actual payment confirmation notifies the tenant");
  assert.strictEqual(notifications[0].tenant_id, "tenant-a", "notification never loses its tenant scope");
  assert.strictEqual(notified.tenant_order_notification.status, "sent");

  const failedNotificationService = createCustomerOrderService({
    store: new InMemoryCustomerOrderStore(),
    notifyTenantOrder: async function () { throw new Error("meta_delivery_failed"); }
  });
  await failedNotificationService.create(Object.assign({}, base, { id: "ord-notify-failure" }));
  const confirmedDespiteFailure = await failedNotificationService.action("tenant-a", "ord-notify-failure", "confirm_payment", {}, "agent@example.com");
  assert.strictEqual(confirmedDespiteFailure.stage, "pagado", "a notification failure cannot reverse the order");
  assert.strictEqual(confirmedDespiteFailure.tenant_order_notification.status, "failed");
  const preparing = await service.action("tenant-a", "ord-a", "start_preparation", {}, "agent@example.com");
  assert.strictEqual(preparing.stage, "preparacion");
  await rejectsCode(service.action("tenant-a", "ord-a", "mark_sent", {}, "agent@example.com"), "tracking_required");
  await rejectsCode(service.action("tenant-a", "ord-a", "send_tracking", { tracking_number: "CO123" }, "agent@example.com"), "tracking_url_required");
  await rejectsCode(service.action("tenant-a", "ord-a", "send_tracking", { tracking_number: "CO123", tracking_url: "http://transportadora.example/rastrear/CO123" }, "agent@example.com"), "tracking_url_invalid");
  assert.deepStrictEqual(deliveries, []);
  const tracked = await service.action("tenant-a", "ord-a", "send_tracking", {
    tracking_number: "CO123",
    tracking_url: "https://transportadora.example/rastrear/CO123"
  }, "agent@example.com");
  assert.strictEqual(tracked.tracking_number, "CO123");
  assert.strictEqual(tracked.tracking_url, "https://transportadora.example/rastrear/CO123");
  assert.deepStrictEqual(deliveries, [{
    tenant_id: "tenant-a",
    conversation_id: "ig:customer-a",
    tracking: "CO123",
    tracking_url: "https://transportadora.example/rastrear/CO123"
  }]);
  const sent = await service.action("tenant-a", "ord-a", "mark_sent", {}, "agent@example.com");
  assert.strictEqual(sent.stage, "enviado");
  await rejectsCode(service.action("tenant-a", "ord-a", "cancel", {}, "agent@example.com"), "invalid_transition");

  const duplicate = await service.create(Object.assign({}, base, { name: "No debe reemplazar" }));
  assert.strictEqual(duplicate.name, "Valentina Ríos");
  assert.strictEqual((await service.list("tenant-a")).length, 1);

  const id1 = service.createId({ tenant_id: "tenant-a", conversation_id: "wa:1", source_event_id: "event-1" });
  const id2 = service.createId({ tenant_id: "tenant-a", conversation_id: "wa:1", source_event_id: "event-1" });
  const idOtherTenant = service.createId({ tenant_id: "tenant-b", conversation_id: "wa:1", source_event_id: "event-1" });
  assert.strictEqual(id1, id2);
  assert.notStrictEqual(id1, idOtherTenant);

  const pendingShipping = await service.create({
    id: "ord-pending-shipping",
    tenant_id: "tenant-a",
    conversation_id: "wa:2",
    items: [{ name: "Producto", qty: 1, price: 84950 }],
    shipping_status: "pending_quote",
    shipping_policy: "Cobertura nacional con excepciones."
  });
  assert.strictEqual(pendingShipping.shipping, 0);
  assert.strictEqual(pendingShipping.total, null);
  assert.strictEqual(pendingShipping.shipping_status, "pending_quote");
  const defaultShipping = await service.action("tenant-a", pendingShipping.id, "confirm_payment", {}, "agent@example.com");
  assert.strictEqual(defaultShipping.stage, "pagado");
  assert.strictEqual(defaultShipping.shipping, 10000);
  assert.strictEqual(defaultShipping.shipping_status, "priced");
  assert.strictEqual(defaultShipping.total, 94950);

  const customShippingDraft = await service.create({
    id: "ord-custom-shipping",
    tenant_id: "tenant-a",
    conversation_id: "wa:custom-shipping",
    items: [{ name: "Producto", qty: 1, price: 84950 }],
    shipping_status: "pending_quote"
  });
  const customShipping = await service.action("tenant-a", customShippingDraft.id, "confirm_payment", { shipping: 15000 }, "agent@example.com");
  assert.strictEqual(customShipping.stage, "pagado");
  assert.strictEqual(customShipping.shipping, 15000);
  assert.strictEqual(customShipping.total, 99950);

  const pricedShippingDraft = await service.create({
    id: "ord-priced-shipping",
    tenant_id: "tenant-a",
    conversation_id: "wa:priced-shipping",
    items: [{ name: "Producto", qty: 1, price: 84950 }],
    shipping_status: "pending_quote"
  });
  const pricedShipping = await service.upsertDraft(Object.assign({}, pricedShippingDraft, {
    shipping: 12900,
    shipping_status: "priced",
    shipping_policy: "Tarifa nacional configurada."
  }));
  assert.strictEqual(pricedShipping.id, pricedShippingDraft.id);
  assert.strictEqual(pricedShipping.revision, pricedShippingDraft.revision + 1);
  assert.strictEqual(pricedShipping.shipping, 12900);
  assert.strictEqual(pricedShipping.total, 97850);
  assert.strictEqual((await service.list("tenant-a")).filter(function (order) { return order.id === pricedShipping.id; }).length, 1);

  const trackingDraftOrder = await service.create(Object.assign({}, base, {
    id: "ord-tracking-draft",
    order_number: "NX-0002",
    conversation_id: "wa:tracking-draft"
  }));
  const trackingDraft = await service.action("tenant-a", trackingDraftOrder.id, "save_tracking_draft", {
    tracking_number: "DRAFT-456",
    tracking_url: "https://transportadora.example/rastrear/DRAFT-456"
  }, "agent@example.com");
  assert.strictEqual(trackingDraft.stage, "por_confirmar");
  assert.strictEqual(trackingDraft.tracking_number, "DRAFT-456");
  assert.strictEqual(trackingDraft.tracking_url, "https://transportadora.example/rastrear/DRAFT-456");
  assert.strictEqual(trackingDraft.tracking_sent_at, "");
  assert.strictEqual(deliveries.length, 1, "saving a draft must not contact the customer");
  await service.action("tenant-a", trackingDraft.id, "confirm_payment", {}, "agent@example.com");
  await service.action("tenant-a", trackingDraft.id, "start_preparation", {}, "agent@example.com");
  await rejectsCode(service.action("tenant-a", trackingDraft.id, "mark_sent", {}, "agent@example.com"), "tracking_required");
  const deliveredDraft = await service.action("tenant-a", trackingDraft.id, "send_tracking", {
    tracking_number: trackingDraft.tracking_number,
    tracking_url: trackingDraft.tracking_url
  }, "agent@example.com");
  assert(deliveredDraft.tracking_sent_at);
  assert.strictEqual((await service.action("tenant-a", trackingDraft.id, "mark_sent", {}, "agent@example.com")).stage, "enviado");

  console.log("customer orders tests passed");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
