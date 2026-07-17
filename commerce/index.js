"use strict";

const { CommerceRegistry } = require("./registry");
const { createShopifyAdapter, SHOPIFY_CAPABILITIES } = require("./shopify-adapter");

module.exports = {
  CommerceRegistry,
  SHOPIFY_CAPABILITIES,
  createShopifyAdapter
};
