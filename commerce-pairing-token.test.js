"use strict";

const assert = require("assert");
const {
  cleanShopifyShop,
  createPairingToken,
  verifyPairingToken
} = require("./commerce/pairing-token");

assert.strictEqual(cleanShopifyShop("https://store-a.myshopify.com/admin"), "store-a.myshopify.com");
assert.strictEqual(cleanShopifyShop("store-b.myshopify.com"), "store-b.myshopify.com");
assert.strictEqual(cleanShopifyShop("https://example.com"), "");
assert.strictEqual(cleanShopifyShop("evil.myshopify.com.ejemplo.com"), "");

const token = createPairingToken({
  tenant_id: "tenant-a",
  bot_id: "commerce",
  shop: "store-a.myshopify.com",
  nonce: "nonce_123"
}, { secret: "0123456789abcdef0123456789abcdef" });

assert(token.startsWith("nexforia-pairing-v1."));
assert.deepStrictEqual(
  verifyPairingToken(token, { secret: "0123456789abcdef0123456789abcdef" }),
  {
    tenant_id: "tenant-a",
    bot_id: "commerce",
    nonce: "nonce_123",
    shop: "store-a.myshopify.com",
    exp: verifyPairingToken(token, { secret: "0123456789abcdef0123456789abcdef" }).exp
  }
);
assert.throws(function () {
  verifyPairingToken(token + "altered", { secret: "0123456789abcdef0123456789abcdef" });
}, /invalid_pairing_token/);
assert.throws(function () {
  createPairingToken({
    tenant_id: "tenant-a",
    bot_id: "commerce"
  }, { secret: "short" });
}, /pairing_secret_required/);

console.log("commerce pairing token tests passed");
