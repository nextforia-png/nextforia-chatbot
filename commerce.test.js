"use strict";

const assert = require("assert");
const { CommerceRegistry, createShopifyAdapter } = require("./commerce");

async function run() {
  const calls = [];
  const registry = new CommerceRegistry();
  registry.register("RAV-Toys", createShopifyAdapter({
    async searchProducts(query, options) {
      calls.push({ method: "search", query, options });
      return { query, total: 1, products: [{ title: "Carro" }] };
    },
    async lookupOrderStatus(input, options) {
      calls.push({ method: "order", input, options });
      return { found: true, matched: true, order_name: "#RAV-1" };
    }
  }));

  const search = await registry.searchProducts("rav-toys", "carro", { suppressSideEffects: true });
  assert.strictEqual(search.total, 1);
  assert.strictEqual(calls[0].method, "search");
  assert.strictEqual(calls[0].options.suppressSideEffects, true);

  const order = await registry.lookupOrderStatus("rav-toys", { order_number: "1" });
  assert.strictEqual(order.matched, true);
  assert.strictEqual(calls[1].method, "order");

  assert.deepStrictEqual(registry.describe("rav-toys"), {
    tenant_id: "rav-toys",
    platform: "shopify",
    capabilities: {
      product_search: true,
      inventory_lookup: true,
      order_tracking: true,
      checkout_links: false,
      webhooks: false
    }
  });

  assert.throws(
    () => registry.resolve("missing-store"),
    error => error && error.code === "commerce_integration_not_configured"
  );
  assert.throws(
    () => registry.register("broken", { platform: "custom" }),
    /commerce_adapter_searchProducts_required/
  );

  console.log("commerce adapter tests passed");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
