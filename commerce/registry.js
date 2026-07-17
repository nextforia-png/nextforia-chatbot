"use strict";

const REQUIRED_METHODS = ["searchProducts", "lookupOrderStatus"];

function cleanTenantId(value) {
  return String(value || "").trim().toLowerCase();
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("commerce_adapter_required");
  }
  if (!String(adapter.platform || "").trim()) {
    throw new TypeError("commerce_adapter_platform_required");
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== "function") {
      throw new TypeError(`commerce_adapter_${method}_required`);
    }
  }
  return adapter;
}

class CommerceRegistry {
  constructor() {
    this.adapters = new Map();
  }

  register(tenantId, adapter) {
    const key = cleanTenantId(tenantId);
    if (!key) throw new TypeError("commerce_tenant_id_required");
    this.adapters.set(key, validateAdapter(adapter));
    return this;
  }

  resolve(tenantId) {
    const key = cleanTenantId(tenantId);
    const adapter = this.adapters.get(key);
    if (!adapter) {
      const error = new Error("commerce_integration_not_configured");
      error.code = "commerce_integration_not_configured";
      error.tenantId = key || null;
      throw error;
    }
    return adapter;
  }

  searchProducts(tenantId, query, options) {
    return this.resolve(tenantId).searchProducts(query, options || {});
  }

  lookupOrderStatus(tenantId, input, options) {
    return this.resolve(tenantId).lookupOrderStatus(input || {}, options || {});
  }

  describe(tenantId) {
    const adapter = this.resolve(tenantId);
    return {
      tenant_id: cleanTenantId(tenantId),
      platform: adapter.platform,
      capabilities: Object.assign({}, adapter.capabilities || {})
    };
  }

  list() {
    return Array.from(this.adapters.keys()).map(tenantId => this.describe(tenantId));
  }
}

module.exports = {
  CommerceRegistry,
  REQUIRED_METHODS,
  cleanTenantId,
  validateAdapter
};
