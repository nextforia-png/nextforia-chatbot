"use strict";

const assert = require("assert");
const {
  InMemoryCustomerOrderStore,
  CustomerOrderError,
  createCustomerOrderService
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
    sendTracking: async function (order, tracking) {
      deliveries.push({ tenant_id: order.tenant_id, conversation_id: order.conversation_id, tracking });
    }
  });
  const base = {
    id: "ord-a",
    order_number: "NX-0001",
    tenant_id: "tenant-a",
    conversation_id: "ig:customer-a",
    name: "Valentina Ríos",
    items: [{ name: "Producto", qty: 2, price: 45000 }],
    stage: "por_confirmar"
  };
  const created = await service.create(base);
  assert.strictEqual(created.tenant_id, "tenant-a");
  assert.strictEqual((await service.list("tenant-a")).length, 1);
  assert.strictEqual((await service.list("tenant-b")).length, 0);
  await rejectsCode(service.get("tenant-b", "ord-a"), "order_not_found");

  const paid = await service.action("tenant-a", "ord-a", "confirm_payment", {}, "agent@example.com");
  assert.strictEqual(paid.stage, "pagado");
  await rejectsCode(service.action("tenant-a", "ord-a", "confirm_payment", {}, "agent@example.com"), "invalid_transition");
  const preparing = await service.action("tenant-a", "ord-a", "start_preparation", {}, "agent@example.com");
  assert.strictEqual(preparing.stage, "preparacion");
  await rejectsCode(service.action("tenant-a", "ord-a", "mark_sent", {}, "agent@example.com"), "tracking_required");
  const tracked = await service.action("tenant-a", "ord-a", "send_tracking", { tracking_number: "CO123" }, "agent@example.com");
  assert.strictEqual(tracked.tracking_number, "CO123");
  assert.deepStrictEqual(deliveries, [{ tenant_id: "tenant-a", conversation_id: "ig:customer-a", tracking: "CO123" }]);
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

  console.log("customer orders tests passed");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
