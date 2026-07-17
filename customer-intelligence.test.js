"use strict";

const assert = require("assert");
const {
  adaptiveConversationBudget,
  buildCustomerMemoryContext,
  evolveCustomerMemory,
  normalizeMemory
} = require("./customer-intelligence");

function evolve(memory, event) {
  return evolveCustomerMemory(memory, Object.assign({ now: "2026-07-16T12:00:00.000Z" }, event));
}

function run() {
  assert.strictEqual(adaptiveConversationBudget({ userMessage: "Hola", history: [] }).tier, "standard");
  assert.strictEqual(adaptiveConversationBudget({ userMessage: "¿Cuánto vale y tienen envío?", history: [] }).tier, "engaged");
  assert.strictEqual(adaptiveConversationBudget({ userMessage: "Quiero comprarlo y pagar hoy", history: [] }).tier, "high");
  assert.strictEqual(adaptiveConversationBudget({
    userMessage: "Listo",
    checkout: { products: [{ title: "Lego Ferrari" }] }
  }).tier, "high");

  const casual = evolve(null, { userMessage: "Hola, solo estaba mirando" });
  assert.strictEqual(casual.changed, false);
  assert.strictEqual(casual.memory.purchase_stage, "none");

  const intent = evolve(null, { userMessage: "Hola, me llamo Laura y quiero comprar hoy" });
  assert.strictEqual(intent.changed, true);
  assert.strictEqual(intent.memory.preferred_name, "Laura");
  assert.strictEqual(intent.memory.purchase_stage, "interested");
  assert.strictEqual(intent.memory.priority, "high");

  const checkout = {
    products: [{ title: "Lego Ferrari" }],
    data: {
      nombre: "Laura Gómez",
      cedula: "123456789",
      direccion: "Calle privada 123",
      metodo_pago: "transferencia"
    }
  };
  const selected = evolve(intent.memory, {
    userMessage: "Ese es",
    toolName: "select_product_for_purchase",
    toolResult: { added: true, title: "Lego Ferrari" },
    checkout
  });
  assert.deepStrictEqual(selected.memory.interests, ["Lego Ferrari"]);
  assert.strictEqual(selected.memory.preferred_name, "Laura Gómez");
  const serialized = JSON.stringify(selected.memory);
  assert.ok(!serialized.includes("123456789"));
  assert.ok(!serialized.includes("Calle privada"));
  assert.ok(!serialized.includes("transferencia"));

  const checkoutStarted = evolve(selected.memory, {
    toolName: "save_checkout_field",
    toolResult: { saved: "telefono" },
    checkout
  });
  assert.strictEqual(checkoutStarted.memory.purchase_stage, "checkout_started");

  const payment = evolve(checkoutStarted.memory, {
    toolName: "send_payment_link",
    toolResult: { sent: true },
    checkout
  });
  assert.strictEqual(payment.memory.purchase_stage, "payment_pending");

  const verified = evolve(payment.memory, {
    toolName: "lookup_order_status",
    toolResult: { found: true, matched: true, order_name: "#1154", created_at: "2026-07-10T10:00:00.000Z" }
  });
  assert.strictEqual(verified.memory.purchase_stage, "confirmed_customer");
  assert.deepStrictEqual(verified.memory.confirmed_orders, ["#1154"]);
  assert.strictEqual(adaptiveConversationBudget({ userMessage: "Hola de nuevo", memory: verified.memory }).tier, "high");

  const unmatched = evolve(null, {
    toolName: "lookup_order_status",
    toolResult: { found: true, matched: false, order_name: "#9999" }
  });
  assert.strictEqual(unmatched.changed, false);
  assert.deepStrictEqual(normalizeMemory(unmatched.memory).confirmed_orders, []);

  const returningContext = buildCustomerMemoryContext(verified.memory, { newSession: true });
  assert.ok(returningContext.includes("Saluda al cliente por su nombre una sola vez"));
  assert.ok(returningContext.includes("Solo los pedidos listados como verificados son compras confirmadas"));
  const activeContext = buildCustomerMemoryContext(verified.memory, { newSession: false });
  assert.ok(activeContext.includes("No repitas el nombre en cada mensaje"));

  console.log("customer-intelligence: assertions passed");
}

run();
