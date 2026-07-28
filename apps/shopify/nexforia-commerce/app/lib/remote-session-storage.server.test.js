import assert from "node:assert/strict";
import test from "node:test";
import { Session } from "@shopify/shopify-api";
import {
  RemoteSessionStorage,
  confirmPairingWithBackend
} from "./remote-session-storage.server.js";

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

test("remote storage serializes Shopify sessions without exposing them to the browser", async () => {
  const calls = [];
  const session = new Session({
    id: "offline_store.myshopify.com",
    shop: "store.myshopify.com",
    state: "state",
    isOnline: false,
    accessToken: "secret-token",
    scope: "read_products"
  });
  const storage = new RemoteSessionStorage({
    baseUrl: "https://nextforia.com",
    secret: "s".repeat(64),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(200, { ok: true });
    }
  });

  assert.equal(await storage.storeSession(session), true);
  assert.equal(calls[0].url, "https://nextforia.com/internal/shopify/sessions");
  assert.match(calls[0].options.headers.Authorization, /^Bearer /);
  assert.match(calls[0].options.body, /secret-token/);
});

test("remote storage recreates sessions and handles missing sessions", async () => {
  const entries = [
    ["id", "offline_store.myshopify.com"],
    ["shop", "store.myshopify.com"],
    ["state", "state"],
    ["isOnline", false],
    ["accessToken", "token"]
  ];
  const storage = new RemoteSessionStorage({
    baseUrl: "https://nextforia.com",
    secret: "s".repeat(64),
    fetchImpl: async (url) =>
      url.includes("missing") ? response(404, { error: "not_found" }) : response(200, { session: entries })
  });

  const loaded = await storage.loadSession("offline_store.myshopify.com");
  assert.equal(loaded.shop, "store.myshopify.com");
  assert.equal(await storage.loadSession("missing"), undefined);
});

test("pairing callback is server-to-server and tenant result comes from the signed token", async () => {
  let request;
  const result = await confirmPairingWithBackend({
    baseUrl: "https://nextforia.com",
    secret: "s".repeat(64),
    pairingToken: "signed-token",
    shop: "store.myshopify.com",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(200, { ok: true, tenant_id: "tenant-a", shop: "store.myshopify.com" });
    }
  });
  assert.equal(result.tenant_id, "tenant-a");
  assert.equal(request.url, "https://nextforia.com/internal/shopify/pairings");
  assert.match(request.options.body, /signed-token/);
});
