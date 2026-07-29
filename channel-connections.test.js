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
    actor: "admin@a.example",
    return_path: "/admin/super-admin?view=setupReview&tenant_id=tenant-a"
  }, 1000);
  assert.strictEqual(readOAuthState(stateSecret, state, 2000).tenant_id, "tenant-a");
  assert.strictEqual(readOAuthState(stateSecret, state, 2000).channel, "instagram");
  assert.strictEqual(readOAuthState(stateSecret, state, 2000).return_path, "/admin/super-admin?view=setupReview&tenant_id=tenant-a");
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

  const activationRequests = [];
  const activationMeta = new MetaChannelProvider({
    appId: "123456789",
    appSecret: "meta-app-secret",
    whatsappConfigId: "wa-config-123",
    graphVersion: "v25.0",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: async function (request) {
      activationRequests.push(request);
      return {
        data: request.url.endsWith("/ig-rav")
          ? { id: "ig-rav", username: "ravtoys", name: "RAV Toys" }
          : { success: true }
      };
    }
  });
  const activatedInstagram = await activationMeta.activate("instagram", {
    page_id: "page-rav",
    instagram_user_id: "ig-rav",
    account_label: "@ravtoys",
    access_token: "page-access-token"
  });
  assert.strictEqual(activatedInstagram.account_label, "@ravtoys");
  assert.strictEqual(
    activationRequests[0].params.subscribed_fields,
    "messages,messaging_postbacks,message_reactions,message_reads"
  );
  assert(!activationRequests[0].params.subscribed_fields.includes("messaging_seen"));

  activationRequests.length = 0;
  const activatedWhatsApp = await activationMeta.activate("whatsapp", {
    whatsapp_business_account_id: "waba-rav",
    phone_number_id: "phone-rav",
    account_label: "+57 301 587 2708",
    access_token: "whatsapp-access-token"
  });
  assert.strictEqual(activatedWhatsApp.account_label, "+57 301 587 2708");
  assert(activationRequests[0].url.endsWith("/waba-rav/subscribed_apps"));
  assert(activationRequests[1].url.endsWith("/phone-rav/register"));
  assert.strictEqual(activationRequests[1].method, "POST");
  assert.strictEqual(activationRequests[1].data.messaging_product, "whatsapp");
  assert.match(activationRequests[1].data.pin, /^\d{6}$/);
  assert(!JSON.stringify(activationRequests).includes("meta-app-secret"));
  assert(activationRequests[2].url.endsWith("/phone-rav"));

  activationRequests.length = 0;
  const activatedCoexistence = await activationMeta.activate("whatsapp", {
    whatsapp_business_account_id: "waba-rav",
    phone_number_id: "phone-rav",
    account_label: "+57 301 587 2708",
    access_token: "whatsapp-access-token",
    coexistence: true
  });
  assert.strictEqual(activatedCoexistence.account_label, "+57 301 587 2708");
  assert(activationRequests[0].url.endsWith("/waba-rav/subscribed_apps"));
  assert(!activationRequests.some(function (request) { return request.url.endsWith("/register"); }));
  assert(activationRequests[1].url.endsWith("/phone-rav"));

  const currentWhatsAppSubscriptionShape = new MetaChannelProvider({
    appId: "123456789",
    appSecret: "meta-app-secret",
    whatsappConfigId: "wa-config-123",
    graphVersion: "v25.0",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: async function (request) {
      if (request.url.endsWith("/waba-rav/subscribed_apps")) {
        return {
          data: {
            data: [{
              whatsapp_business_api_data: {
                id: "123456789",
                name: "NextforIA Chatbot"
              }
            }]
          }
        };
      }
      return { data: { id: "phone-rav", display_phone_number: "+57 301 587 2708" } };
    }
  });
  const currentShapeVerification = await currentWhatsAppSubscriptionShape.verify("whatsapp", {
    whatsapp_business_account_id: "waba-rav",
    phone_number_id: "phone-rav",
    access_token: "whatsapp-access-token"
  });
  assert.strictEqual(currentShapeVerification.ok, true);

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

  const adoptedStore = new InMemoryChannelConnectionStore();
  const adoptedService = createChannelConnectionService({
    store: adoptedStore,
    provider: {
      configured: function () { return true; },
      activate: async function (channel, candidate) {
        assert.strictEqual(channel, "whatsapp");
        assert.strictEqual(candidate.whatsapp_business_account_id, "waba-existing");
        assert.strictEqual(candidate.phone_number_id, "phone-existing");
        return Object.assign({}, candidate, {
          account_id: candidate.phone_number_id,
          account_label: "+57 301 587 2708"
        });
      }
    },
    encryptionKey,
    now: function () { return new Date("2026-07-26T11:00:00.000Z"); }
  });
  const adopted = await adoptedService.adoptExisting("tenant-rav", "whatsapp", "system:environment", {
    id: "wa:phone-existing",
    account_id: "phone-existing",
    account_label: "+57 301 587 2708",
    whatsapp_business_account_id: "waba-existing",
    phone_number_id: "phone-existing",
    access_token: "system-user-token"
  });
  assert.strictEqual(adopted.status, "connected");
  assert.strictEqual(adopted.tenant_id, "tenant-rav");
  assert.strictEqual(adopted.phone_number_id, "phone-existing");
  assert(!JSON.stringify(adopted).includes("system-user-token"));
  const adoptedStored = await adoptedStore.get("tenant-rav", "whatsapp");
  assert.strictEqual(adoptedStored.credential_source, "oauth");
  assert(adoptedStored.credentials_ciphertext.startsWith("enc:v1:"));
  assert(!adoptedStored.credentials_ciphertext.includes("system-user-token"));

  let repairedSubscriptions = 0;
  const repairStore = new InMemoryChannelConnectionStore();
  const repairService = createChannelConnectionService({
    store: repairStore,
    provider: {
      configured: function () { return true; },
      activate: async function (_, candidate) { return candidate; },
      subscribe: async function (channel, credential) {
        assert.strictEqual(channel, "whatsapp");
        assert.strictEqual(credential.whatsapp_business_account_id, "waba-repair");
        assert.strictEqual(credential.access_token, "repair-token");
        repairedSubscriptions++;
        return { ok: true };
      },
      verify: async function () {
        return { ok: true, account_label: "+57 301 587 2708" };
      }
    },
    encryptionKey,
    now: function () { return new Date("2026-07-29T18:00:00.000Z"); }
  });
  await repairService.adoptExisting("tenant-repair", "whatsapp", "system:bootstrap", {
    account_id: "phone-repair",
    account_label: "+57 301 587 2708",
    whatsapp_business_account_id: "waba-repair",
    phone_number_id: "phone-repair",
    access_token: "repair-token",
    coexistence: true
  });
  const repairedConnection = await repairService.repairSubscription(
    "tenant-repair",
    "whatsapp",
    "system:webhook-repair"
  );
  assert.strictEqual(repairedSubscriptions, 1);
  assert.strictEqual(repairedConnection.status, "connected");
  assert.strictEqual(repairedConnection.webhook_status, "subscribed");
  assert(!JSON.stringify(repairedConnection).includes("repair-token"));

  const embeddedStore = new InMemoryChannelConnectionStore();
  const embeddedService = createChannelConnectionService({
    store: embeddedStore,
    provider: {
      configured: function () { return true; },
      prepareEmbeddedWhatsApp: async function (code, session) {
        assert.strictEqual(code, "embedded-code");
        assert.strictEqual(session.waba_id, "waba-smb");
        assert.strictEqual(session.phone_number_id, "phone-smb");
        return {
          id: "wa:phone-smb",
          account_id: "phone-smb",
          account_label: "+57 301 587 2708",
          whatsapp_business_account_id: "waba-smb",
          phone_number_id: "phone-smb",
          access_token: "embedded-business-token",
          coexistence: true
        };
      },
      activate: async function (channel, candidate) {
        assert.strictEqual(channel, "whatsapp");
        assert.strictEqual(candidate.coexistence, true);
        return candidate;
      }
    },
    encryptionKey,
    now: function () { return new Date("2026-07-28T22:00:00.000Z"); }
  });
  const embedded = await embeddedService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-smb",
    actor: "owner@smb.example",
    code: "embedded-code",
    session: { waba_id: "waba-smb", phone_number_id: "phone-smb" }
  });
  assert.strictEqual(embedded.connection.status, "connected");
  assert.strictEqual(embedded.connection.account_label, "+57 301 587 2708");
  assert(!JSON.stringify(embedded).includes("embedded-business-token"));
  const embeddedStored = await embeddedStore.get("tenant-smb", "whatsapp");
  assert(embeddedStored.credentials_ciphertext.startsWith("enc:v1:"));

  const beginUrl = await service.begin("tenant-a", "instagram", "admin@a.example", state);
  assert(beginUrl.startsWith("https://www.facebook.com/"));
  let tenantA = await service.listTenant("tenant-a");
  const connectingInstagram = tenantA.find(function (row) { return row.channel === "instagram"; });
  assert.strictEqual(connectingInstagram.status, "connecting");
  assert.strictEqual(connectingInstagram.reconnect_available, true);
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
  await legacyStore.upsert({
    tenant_id: "rav-toys",
    channel: "whatsapp",
    status: "connected",
    protected_legacy: false,
    credentials_ciphertext: "enc:v1:existing-encrypted-credential"
  });
  const coexistenceUrl = await legacyService.begin("rav-toys", "whatsapp", "super-admin", state);
  assert(coexistenceUrl.includes("channel=whatsapp"));

  const optedInLegacyService = createChannelConnectionService({
    store: new InMemoryChannelConnectionStore(),
    provider,
    encryptionKey: crypto.randomBytes(32),
    legacyConnections: legacy,
    allowProtectedLegacyReconnect: function (tenantId, channel) {
      return tenantId === "rav-toys" && channel === "whatsapp";
    }
  });
  const optedInUrl = await optedInLegacyService.begin("rav-toys", "whatsapp", "super-admin", state);
  assert(optedInUrl.includes("channel=whatsapp"));

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
