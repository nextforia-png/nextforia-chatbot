"use strict";

const assert = require("assert");
const crypto = require("crypto");
const {
  AppendOnlyChannelConnectionStore,
  ChannelConnectionError,
  InMemoryChannelConnectionStore,
  MetaChannelProvider,
  createChannelConnectionService,
  createLegacyConnections,
  createOAuthState,
  readOAuthState
} = require("./channel-connections");

function expectCode(promise, code) {
  return promise.then(function () {
    assert.fail("Expected " + code);
  }, function (error) {
    assert(error instanceof ChannelConnectionError);
    assert.strictEqual(error.code, code);
  });
}

(async function run() {
  const stateSecret = "channel-state-secret-value-that-is-long-enough";
  const state = createOAuthState(stateSecret, {
    tenant_id: "tenant-a",
    channel: "instagram",
    actor_id: "user-a",
    actor: "admin@a.example"
  }, 1000);
  assert.strictEqual(readOAuthState(stateSecret, state, 2000).tenant_id, "tenant-a");
  assert.strictEqual(readOAuthState(stateSecret, state, 2000).channel, "instagram");
  assert.strictEqual(readOAuthState(stateSecret, state.slice(0, -1) + "x", 2000), null);
  assert.strictEqual(readOAuthState(stateSecret, state, 11 * 60 * 1000), null);

  const meta = new MetaChannelProvider({
    appId: "123456789",
    appSecret: "meta-app-secret",
    whatsappConfigId: "wa-config-123",
    graphVersion: "v23.0",
    redirectUri: "https://staging.nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: function () {}
  });
  const waUrl = new URL(meta.authorizationUrl("whatsapp", state));
  assert.strictEqual(waUrl.hostname, "www.facebook.com");
  assert.strictEqual(waUrl.searchParams.get("config_id"), "wa-config-123");
  assert(waUrl.searchParams.get("scope").includes("whatsapp_business_management"));
  assert(!waUrl.toString().includes("meta-app-secret"));
  const instagramUrl = new URL(meta.authorizationUrl("instagram", state));
  assert(instagramUrl.searchParams.get("scope").includes("instagram_manage_messages"));

  const provider = {
    configured: function () { return true; },
    authorizationUrl: function (channel, signedState) {
      return "https://www.facebook.com/v23.0/dialog/oauth?channel=" + channel + "&state=" + encodeURIComponent(signedState);
    },
    exchangeCode: async function (code) {
      if (code !== "valid-code") throw new ChannelConnectionError("invalid_authorization", 422, "OAuth code invalid");
      return "secret-user-access-token";
    },
    discoverAssets: async function (channel, accessToken) {
      assert.strictEqual(accessToken, "secret-user-access-token");
      return [
        {
          id: channel + ":asset-one",
          label: "Cuenta Uno",
          detail: "Negocio Uno",
          account_id: "asset-one",
          account_label: "Cuenta Uno",
          page_id: channel === "whatsapp" ? null : "page-one",
          instagram_user_id: channel === "instagram" ? "ig-one" : null,
          access_token: "secret-page-token-one"
        },
        {
          id: channel + ":asset-two",
          label: "Cuenta Dos",
          detail: "Negocio Dos",
          account_id: "asset-two",
          account_label: "Cuenta Dos",
          page_id: channel === "whatsapp" ? null : "page-two",
          instagram_user_id: channel === "instagram" ? "ig-two" : null,
          access_token: "secret-page-token-two"
        }
      ];
    },
    activate: async function (channel, candidate) {
      assert.strictEqual(channel, "instagram");
      return candidate;
    },
    verify: async function () {
      return { ok: false, error: "Meta token expired" };
    },
    disconnect: async function (_, credential) {
      assert.strictEqual(credential.access_token, "secret-page-token-two");
      return { ok: true };
    }
  };

  const store = new InMemoryChannelConnectionStore();
  const encryptionKey = crypto.randomBytes(32);
  const service = createChannelConnectionService({
    store,
    provider,
    encryptionKey,
    now: function () { return new Date("2026-07-26T12:00:00.000Z"); }
  });

  const beginUrl = await service.begin("tenant-a", "instagram", "admin@a.example", state);
  assert(beginUrl.startsWith("https://www.facebook.com/"));
  let tenantA = await service.listTenant("tenant-a");
  assert.strictEqual(tenantA.find(function (row) { return row.channel === "instagram"; }).status, "connecting");
  let tenantB = await service.listTenant("tenant-b");
  assert.strictEqual(tenantB.find(function (row) { return row.channel === "instagram"; }).status, "not_connected");

  const pending = await service.completeAuthorization({
    tenant_id: "tenant-a",
    channel: "instagram",
    actor: "admin@a.example",
    code: "valid-code"
  });
  assert.strictEqual(pending.status, "selection_required");
  assert.strictEqual(pending.connection.pending_assets.length, 2);
  assert(!JSON.stringify(pending).includes("secret-user-access-token"));
  assert(!JSON.stringify(pending).includes("secret-page-token"));
  assert(store.rows[0].credentials_ciphertext.startsWith("enc:v1:"));
  assert(!JSON.stringify(store.rows[0]).includes("secret-user-access-token"));

  const connected = await service.selectAsset("tenant-a", "instagram", "instagram:asset-two", "admin@a.example");
  assert.strictEqual(connected.status, "connected");
  assert.strictEqual(connected.account_label, "Cuenta Dos");
  assert.strictEqual(connected.instagram_user_id, undefined);
  assert(!JSON.stringify(connected).includes("token"));

  const verification = await service.verify("tenant-a", "instagram", "support@nextforia.com");
  assert.strictEqual(verification.status, "needs_attention");
  assert.strictEqual(verification.last_error, "Meta token expired");
  tenantA = await service.listTenant("tenant-a");
  const publicAttention = tenantA.find(function (row) { return row.channel === "instagram"; });
  assert.strictEqual(publicAttention.status, "needs_attention");
  assert.strictEqual("last_error" in publicAttention, false);

  const credentialBeforeDisconnect = store.rows[0].credentials_ciphertext;
  const disconnected = await service.disconnect("tenant-a", "instagram", "admin@a.example");
  assert.strictEqual(disconnected.status, "disconnected");
  assert.strictEqual(store.rows[0].credentials_ciphertext, null);
  assert(store.audit.some(function (event) {
    return event.action === "disconnected" && event.actor === "admin@a.example";
  }));

  const failedDisconnectStore = new InMemoryChannelConnectionStore();
  await failedDisconnectStore.upsert(Object.assign({}, store.rows[0], {
    tenant_id: "tenant-failed-disconnect",
    status: "connected",
    credentials_ciphertext: credentialBeforeDisconnect,
    credential_source: "oauth"
  }));
  const failedDisconnectService = createChannelConnectionService({
    store: failedDisconnectStore,
    provider: Object.assign({}, provider, {
      disconnect: async function () { return { ok: false, error: "Meta unsubscribe failed" }; }
    }),
    encryptionKey
  });
  await expectCode(
    failedDisconnectService.disconnect("tenant-failed-disconnect", "instagram", "owner@example.com"),
    "disconnect_failed"
  );
  const retainedAfterFailedDisconnect = await failedDisconnectStore.get("tenant-failed-disconnect", "instagram");
  assert.strictEqual(retainedAfterFailedDisconnect.status, "needs_attention");
  assert.strictEqual(retainedAfterFailedDisconnect.credentials_ciphertext, credentialBeforeDisconnect);
  assert.strictEqual(failedDisconnectStore.audit.at(-1).action, "disconnect_failed");

  tenantB = await service.listTenant("tenant-b");
  assert.strictEqual(tenantB.find(function (row) { return row.channel === "instagram"; }).status, "not_connected");

  await expectCode(service.completeAuthorization({
    tenant_id: "tenant-a",
    channel: "messenger",
    actor: "admin@a.example",
    code: "bad-code"
  }), "invalid_authorization");
  const all = await service.listAll([{ id: "tenant-a", company_name: "Empresa A" }, { id: "tenant-b", company_name: "Empresa B" }]);
  const failedMessenger = all.find(function (row) { return row.tenant_id === "tenant-a" && row.channel === "messenger"; });
  assert.strictEqual(failedMessenger.status, "needs_attention");
  assert.strictEqual(failedMessenger.last_error, "OAuth code invalid");
  assert(!JSON.stringify(all).includes("secret-page-token"));

  const appendRows = [];
  const appendOnlyStore = new AppendOnlyChannelConnectionStore({
    loadLatest: async function (recordId) {
      const found = appendRows.filter(function (row) { return row.record_id === recordId; }).at(-1);
      return found ? found.record : null;
    },
    loadAll: async function () {
      return appendRows.slice().reverse().map(function (row) { return row.record; });
    },
    append: async function (recordId, record, event) {
      appendRows.push({
        record_id: recordId,
        record: JSON.parse(JSON.stringify(record)),
        event: event && JSON.parse(JSON.stringify(event))
      });
    }
  });
  await appendOnlyStore.upsert({
    tenant_id: "tenant-a",
    channel: "whatsapp",
    status: "connecting",
    pending_assets: []
  }, { action: "oauth_started", actor: "a@example.com" });
  await appendOnlyStore.upsert({
    tenant_id: "tenant-b",
    channel: "whatsapp",
    status: "connected",
    account_label: "Empresa B"
  }, { action: "connected", actor: "b@example.com" });
  await appendOnlyStore.upsert({
    tenant_id: "tenant-a",
    channel: "whatsapp",
    status: "connected",
    account_label: "Empresa A"
  }, { action: "connected", actor: "a@example.com" });
  assert.strictEqual((await appendOnlyStore.get("tenant-a", "whatsapp")).account_label, "Empresa A");
  assert.strictEqual((await appendOnlyStore.get("tenant-b", "whatsapp")).account_label, "Empresa B");
  assert.strictEqual((await appendOnlyStore.listTenant("tenant-a")).length, 1);
  const appendAll = await appendOnlyStore.listAll();
  assert.strictEqual(appendAll.length, 2);
  assert.strictEqual(appendAll.find(function (row) { return row.tenant_id === "tenant-a"; }).account_label, "Empresa A");
  assert.strictEqual(appendRows.filter(function (row) { return row.event && row.event.actor === "a@example.com"; }).length, 2);

  const legacyStore = new InMemoryChannelConnectionStore();
  const legacy = createLegacyConnections({
    tenantId: "rav-toys",
    whatsapp: { configured: true, phoneNumberId: "rav-phone", displayPhone: "+57 301 000 0000" }
  });
  const legacyService = createChannelConnectionService({
    store: legacyStore,
    provider,
    encryptionKey: crypto.randomBytes(32),
    legacyConnections: legacy
  });
  const rav = await legacyService.listTenant("rav-toys", { superAdmin: true });
  assert.strictEqual(rav.find(function (row) { return row.channel === "whatsapp"; }).protected_legacy, true);
  await expectCode(legacyService.disconnect("rav-toys", "whatsapp", "super-admin"), "legacy_connection_protected");
  await expectCode(legacyService.begin("rav-toys", "whatsapp", "super-admin", state), "legacy_connection_protected");

  const upMigration = require("fs").readFileSync("docs/migrations/20260726_channel_connections_v1_up.sql", "utf8");
  assert.match(upMigration, /tenant_channel_connections/);
  assert.match(upMigration, /credentials_ciphertext is null or credentials_ciphertext like 'enc:v1:%'/);
  assert.match(upMigration, /force row level security/);
  assert.match(upMigration, /revoke all[\s\S]*from public, anon, authenticated/);

  console.log("channel-connections.test.js: ok");
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
