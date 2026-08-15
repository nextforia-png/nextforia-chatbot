"use strict";

const assert = require("assert");
const {
  checkoutAmounts,
  confirmedPaymentMessage,
  normalizeShippingPricing,
  shippingQuoteForSubtotal
} = require("./checkout-shipping");

assert.deepStrictEqual(normalizeShippingPricing({}), {
  pricing_mode: "quote",
  flat_fee_cop: 0,
  free_over_cop: 0,
  policy: ""
});
assert.strictEqual(normalizeShippingPricing({ pricing_mode: "flat", flat_fee_cop: 0 }).pricing_mode, "flat");
assert.strictEqual(shippingQuoteForSubtotal({ pricing_mode: "flat", flat_fee_cop: 0 }, 84950).status, "pending_quote");
assert.deepStrictEqual(shippingQuoteForSubtotal({ pricing_mode: "free" }, 84950), {
  status: "free",
  amount: 0,
  subtotal: 84950,
  total: 84950,
  policy: ""
});
assert.deepStrictEqual(shippingQuoteForSubtotal({ pricing_mode: "flat", flat_fee_cop: 12900 }, 84950), {
  status: "priced",
  amount: 12900,
  subtotal: 84950,
  total: 97850,
  policy: ""
});
assert.strictEqual(shippingQuoteForSubtotal({ pricing_mode: "flat", flat_fee_cop: 12900, free_over_cop: 100000 }, 120000).status, "free");
assert.strictEqual(shippingQuoteForSubtotal({ pricing_mode: "quote" }, 84950).total, null);
assert.deepStrictEqual(checkoutAmounts([{ price_amount: 84950 }, { price_amount: 10000, qty: 2 }], { pricing_mode: "flat", flat_fee_cop: 12900 }), {
  status: "priced",
  amount: 12900,
  subtotal: 104950,
  total: 117850,
  policy: ""
});

["Ya pagué", "Ya transferí", "El pago fue realizado", "No pude tomar captura, pero ya lo hice"].forEach(function (message) {
  assert.strictEqual(confirmedPaymentMessage(message), true, message);
});
["Quiero pagar", "¿Cómo pago?", "Todavía no pagué", "No pude pagar", "[AGENTE MULTIMODAL: IMAGEN ANALIZADA]\nPago exitoso"].forEach(function (message) {
  assert.strictEqual(confirmedPaymentMessage(message), false, message);
});

console.log("checkout shipping tests passed");
