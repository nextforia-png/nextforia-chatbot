"use strict";

const SHIPPING_PRICING_MODES = Object.freeze(["flat", "free", "quote"]);

function text(value, maximum) {
  return String(value == null ? "" : value).trim().slice(0, maximum || 3000);
}

function copAmount(value) {
  if (value === "" || value == null) return 0;
  const number = typeof value === "number"
    ? value
    : Number(String(value).replace(/[^0-9-]/g, ""));
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function normalizeShippingPricing(input, fallback) {
  input = input && typeof input === "object" ? input : {};
  fallback = fallback && typeof fallback === "object" ? fallback : {};
  const requestedMode = text(
    input.pricing_mode != null ? input.pricing_mode : fallback.pricing_mode,
    40
  ).toLowerCase();
  let pricingMode = SHIPPING_PRICING_MODES.includes(requestedMode) ? requestedMode : "quote";
  const flatFeeCop = copAmount(
    input.flat_fee_cop != null ? input.flat_fee_cop : fallback.flat_fee_cop
  );
  return {
    pricing_mode: pricingMode,
    flat_fee_cop: flatFeeCop,
    free_over_cop: copAmount(
      input.free_over_cop != null ? input.free_over_cop : fallback.free_over_cop
    ),
    policy: text(input.policy != null ? input.policy : fallback.policy, 3000)
  };
}

function shippingQuoteForSubtotal(configuration, subtotalValue) {
  const pricing = normalizeShippingPricing(configuration);
  const subtotal = copAmount(subtotalValue);
  if (pricing.pricing_mode === "free") {
    return { status: "free", amount: 0, subtotal, total: subtotal, policy: pricing.policy };
  }
  if (pricing.pricing_mode === "flat") {
    if (!pricing.flat_fee_cop) {
      return { status: "pending_quote", amount: null, subtotal, total: null, policy: pricing.policy };
    }
    const thresholdReached = pricing.free_over_cop > 0 && subtotal >= pricing.free_over_cop;
    const amount = thresholdReached ? 0 : pricing.flat_fee_cop;
    return {
      status: thresholdReached ? "free" : "priced",
      amount,
      subtotal,
      total: subtotal + amount,
      policy: pricing.policy
    };
  }
  return { status: "pending_quote", amount: null, subtotal, total: null, policy: pricing.policy };
}

function checkoutSubtotal(products) {
  return (Array.isArray(products) ? products : []).reduce(function (total, product) {
    const price = copAmount(product && (product.price_amount != null ? product.price_amount : product.price));
    const quantity = Math.max(1, Math.floor(Number(product && (product.qty || product.quantity)) || 1));
    return total + price * quantity;
  }, 0);
}

function checkoutAmounts(products, shippingConfiguration) {
  const subtotal = checkoutSubtotal(products);
  return shippingQuoteForSubtotal(shippingConfiguration, subtotal);
}

function confirmedPaymentMessage(value) {
  const original = text(value, 5000);
  if (/^\[AGENTE MULTIMODAL:\s*IMAGEN/i.test(original)) return false;
  const normalized = original.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const explicitConfirmation = /\b(?:ya\s+(?:pague|pago|transferi|consigne)|ya\s+lo\s+hice|hice\s+(?:el|la)\s+(?:pago|transferencia)|acabo\s+de\s+(?:pagar|transferir)|pago\s+(?:fue\s+)?(?:realizado|hecho|exitoso)|transferencia\s+(?:fue\s+)?(?:realizada|hecha|exitosa))\b/.test(normalized);
  if (!explicitConfirmation) return false;
  if (/\b(?:aun|todavia)\s+no\b/.test(normalized)) return false;
  if (/\bno\s+(?:he|hice|pude|puedo|pudimos)\s+(?:pagar|el\s+pago|la\s+transferencia)\b/.test(normalized)) return false;
  return true;
}

module.exports = {
  SHIPPING_PRICING_MODES,
  checkoutAmounts,
  checkoutSubtotal,
  confirmedPaymentMessage,
  copAmount,
  normalizeShippingPricing,
  shippingQuoteForSubtotal
};
