"use strict";

const SHOPIFY_CAPABILITIES = Object.freeze({
  product_search: true,
  inventory_lookup: true,
  order_tracking: true,
  checkout_links: false,
  webhooks: false
});

function createShopifyAdapter(actions) {
  const implementation = actions || {};
  if (typeof implementation.searchProducts !== "function") {
    throw new TypeError("shopify_search_products_required");
  }
  if (typeof implementation.lookupOrderStatus !== "function") {
    throw new TypeError("shopify_lookup_order_status_required");
  }

  return {
    platform: "shopify",
    capabilities: SHOPIFY_CAPABILITIES,
    searchProducts(query, options) {
      return implementation.searchProducts(query, options || {});
    },
    lookupOrderStatus(input, options) {
      return implementation.lookupOrderStatus(input || {}, options || {});
    }
  };
}

module.exports = {
  SHOPIFY_CAPABILITIES,
  createShopifyAdapter
};
